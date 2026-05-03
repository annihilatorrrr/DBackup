import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
    logger: {
        child: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }),
    },
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        execution: {
            count: vi.fn(),
            updateMany: vi.fn(),
        },
        $disconnect: vi.fn(),
    },
}));

vi.mock('@/lib/server/scheduler', () => ({
    scheduler: {
        stopAll: vi.fn(),
    },
}));

describe('shutdown', () => {
    let capturedHandlers: Record<string, (...args: any[]) => void>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        capturedHandlers = {};

        vi.spyOn(process, 'on').mockImplementation((event: any, listener: any) => {
            capturedHandlers[event] = listener;
            return process;
        });
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        // Import fresh mocked prisma after resetModules and set default return values
        const prismaModule = await import('@/lib/prisma');
        vi.mocked(prismaModule.default.execution.count).mockResolvedValue(0);
        vi.mocked(prismaModule.default.execution.updateMany).mockResolvedValue({ count: 0 } as any);
        vi.mocked(prismaModule.default.$disconnect).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isShutdownRequested', () => {
        it('returns false before any signal is received', async () => {
            const { isShutdownRequested } = await import('@/lib/server/shutdown');
            expect(isShutdownRequested()).toBe(false);
        });
    });

    describe('registerShutdownHandlers', () => {
        it('registers handlers for both SIGTERM and SIGINT', async () => {
            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            expect(capturedHandlers['SIGTERM']).toBeDefined();
            expect(capturedHandlers['SIGINT']).toBeDefined();
        });

        it('sets isShuttingDown to true on first signal', async () => {
            const { registerShutdownHandlers, isShutdownRequested } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();
            capturedHandlers['SIGTERM']();
            expect(isShutdownRequested()).toBe(true);
            // Wait for background performShutdown to complete so it does not leak into the next test
            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
        });

        it('forces exit(1) when a second signal arrives while already shutting down', async () => {
            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM'](); // first signal
            capturedHandlers['SIGTERM'](); // second signal while shutting down

            expect(exitSpy).toHaveBeenCalledWith(1);
            // Wait for background performShutdown from the first signal to also complete
            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(2), { timeout: 2000 });
        });

        it('calls exit(0) after a successful graceful shutdown', async () => {
            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
        });

        it('disconnects the database during shutdown', async () => {
            const prismaModule = await import('@/lib/prisma');
            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
            expect(prismaModule.default.$disconnect).toHaveBeenCalled();
        });

        it('cancels pending executions before disconnecting', async () => {
            const prismaModule = await import('@/lib/prisma');
            vi.mocked(prismaModule.default.execution.count)
                .mockResolvedValueOnce(0)  // running count: 0 -> exit loop
                .mockResolvedValueOnce(3); // pending count: 3

            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
            expect(prismaModule.default.execution.updateMany).toHaveBeenCalledWith({
                where: { status: 'Pending' },
                data: { status: 'Failed', endedAt: expect.any(Date) },
            });
        });

        it('continues shutdown when stopping the scheduler throws', async () => {
            const schedulerModule = await import('@/lib/server/scheduler');
            vi.mocked(schedulerModule.scheduler.stopAll).mockImplementation(() => {
                throw new Error('scheduler unavailable');
            });

            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
        });

        it('continues shutdown when the execution count query fails', async () => {
            const prismaModule = await import('@/lib/prisma');
            vi.mocked(prismaModule.default.execution.count)
                .mockRejectedValue(new Error('DB connection lost'));

            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled(), { timeout: 2000 });
        });

        it('polls until all running executions finish before shutting down', async () => {
            vi.useFakeTimers();

            const prismaModule = await import('@/lib/prisma');
            vi.mocked(prismaModule.default.execution.count)
                .mockResolvedValueOnce(2)  // first poll: 2 still running -> wait
                .mockResolvedValue(0);     // subsequent polls: 0 running -> break

            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            // Advance all fake timers (including the 2-second poll interval) and flush promises
            await vi.runAllTimersAsync();

            expect(exitSpy).toHaveBeenCalledWith(0);
            vi.useRealTimers();
        });

        it('continues shutdown when database disconnect fails', async () => {
            const prismaModule = await import('@/lib/prisma');
            vi.mocked(prismaModule.default.$disconnect)
                .mockRejectedValue(new Error('disconnect failed'));

            const { registerShutdownHandlers } = await import('@/lib/server/shutdown');
            registerShutdownHandlers();

            capturedHandlers['SIGTERM']();

            // Shutdown should still complete (error is swallowed)
            await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0), { timeout: 2000 });
        });
    });
});
