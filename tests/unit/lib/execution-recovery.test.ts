import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recoverStaleExecutions } from '@/lib/execution/recovery';
import prisma from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
    default: {
        execution: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logging/logger', () => ({
    logger: {
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        }),
    },
}));

describe('recoverStaleExecutions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does nothing when no stale executions exist', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        await recoverStaleExecutions();

        expect(prisma.execution.update).not.toHaveBeenCalled();
    });

    it('marks Running executions as Failed', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-1', status: 'Running', jobId: 'job-1', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        expect(prisma.execution.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'exec-1' },
                data: expect.objectContaining({ status: 'Failed' }),
            })
        );
    });

    it('marks Pending executions as Failed', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-2', status: 'Pending', jobId: 'job-2', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        expect(prisma.execution.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'exec-2' },
                data: expect.objectContaining({ status: 'Failed' }),
            })
        );
    });

    it('appends a recovery log entry to existing logs', async () => {
        const existingLog = [{ message: 'Starting dump', level: 'info' }];
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-3', status: 'Running', jobId: 'job-3', logs: JSON.stringify(existingLog) },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        const updateCall = (prisma.execution.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const updatedLogs = JSON.parse(updateCall.data.logs);

        // Original log preserved
        expect(updatedLogs[0].message).toBe('Starting dump');
        // Recovery log appended
        expect(updatedLogs[1].level).toBe('error');
        expect(updatedLogs[1].stage).toBe('Recovery');
        expect(updatedLogs[1].message).toContain('interrupted');
    });

    it('uses different recovery message for Pending vs Running status', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-4', status: 'Pending', jobId: 'job-4', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        const updateCall = (prisma.execution.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const updatedLogs = JSON.parse(updateCall.data.logs);
        expect(updatedLogs[0].message).toContain('cancelled');
    });

    it('sets endedAt on updated executions', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-5', status: 'Running', jobId: 'job-5', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        const updateCall = (prisma.execution.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(updateCall.data.endedAt).toBeInstanceOf(Date);
    });

    it('recovers multiple stale executions', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-6', status: 'Running', jobId: 'job-6', logs: '[]' },
            { id: 'exec-7', status: 'Pending', jobId: 'job-7', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await recoverStaleExecutions();

        expect(prisma.execution.update).toHaveBeenCalledTimes(2);
    });

    it('handles malformed logs JSON gracefully', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-8', status: 'Running', jobId: 'job-8', logs: 'INVALID_JSON' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

        // Should not throw
        await expect(recoverStaleExecutions()).resolves.not.toThrow();

        const updateCall = (prisma.execution.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const updatedLogs = JSON.parse(updateCall.data.logs);
        // Started fresh since parsing failed
        expect(updatedLogs).toHaveLength(1);
        expect(updatedLogs[0].level).toBe('error');
    });

    it('continues recovering other executions when one update fails', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'exec-fail', status: 'Running', jobId: 'job-f', logs: '[]' },
            { id: 'exec-ok', status: 'Running', jobId: 'job-ok', logs: '[]' },
        ]);
        (prisma.execution.update as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('DB write error'))
            .mockResolvedValueOnce({});

        await expect(recoverStaleExecutions()).resolves.not.toThrow();
        expect(prisma.execution.update).toHaveBeenCalledTimes(2);
    });

    it('handles findMany failure gracefully', async () => {
        (prisma.execution.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

        await expect(recoverStaleExecutions()).resolves.not.toThrow();
        expect(prisma.execution.update).not.toHaveBeenCalled();
    });
});
