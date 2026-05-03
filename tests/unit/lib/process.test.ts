import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { waitForProcess } from '@/lib/adapters/process';
import type { ChildProcess } from 'child_process';

function makeChildProcess(withStderr = true): {
    child: ChildProcess;
    stderr: EventEmitter;
    emitClose: (code: number) => void;
    emitError: (err: Error) => void;
    emitStderr: (data: string) => void;
} {
    const child = new EventEmitter() as unknown as ChildProcess;
    const stderr = new EventEmitter();

    if (withStderr) {
        (child as any).stderr = stderr;
    } else {
        (child as any).stderr = null;
    }

    return {
        child,
        stderr,
        emitClose: (code: number) => child.emit('close', code),
        emitError: (err: Error) => child.emit('error', err),
        emitStderr: (data: string) => stderr.emit('data', Buffer.from(data)),
    };
}

describe('waitForProcess', () => {
    it('resolves when process exits with code 0', async () => {
        const { child, emitClose } = makeChildProcess();

        const promise = waitForProcess(child, 'test-process');
        emitClose(0);

        await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when process exits with non-zero code', async () => {
        const { child, emitClose } = makeChildProcess();

        const promise = waitForProcess(child, 'test-process');
        emitClose(1);

        await expect(promise).rejects.toThrow('test-process exited with code 1');
    });

    it('includes captured stderr in rejection message', async () => {
        const { child, emitClose, emitStderr } = makeChildProcess();

        const promise = waitForProcess(child, 'pg_dump');
        emitStderr('FATAL: could not connect to server');
        emitClose(2);

        await expect(promise).rejects.toThrow('FATAL: could not connect to server');
    });

    it('rejects on process error event', async () => {
        const { child, emitError } = makeChildProcess();

        const promise = waitForProcess(child, 'mysqldump');
        emitError(new Error('ENOENT'));

        await expect(promise).rejects.toThrow('Failed to start mysqldump: ENOENT');
    });

    it('calls onLog callback with stderr output', async () => {
        const { child, emitClose, emitStderr } = makeChildProcess();
        const onLog = vi.fn();

        const promise = waitForProcess(child, 'test-process', onLog);
        emitStderr('some warning message');
        emitClose(0);

        await promise;
        expect(onLog).toHaveBeenCalledWith('some warning message');
    });

    it('does not call onLog if no callback provided', async () => {
        const { child, emitClose, emitStderr } = makeChildProcess();

        const promise = waitForProcess(child, 'test-process');
        emitStderr('some output');
        emitClose(0);

        await expect(promise).resolves.toBeUndefined();
    });

    it('handles missing stderr (null) without crashing', async () => {
        const { child, emitClose } = makeChildProcess(false);

        const promise = waitForProcess(child, 'no-stderr-process');
        emitClose(0);

        await expect(promise).resolves.toBeUndefined();
    });

    it('truncates stderr to last 1KB to avoid memory issues', async () => {
        const { child, emitClose, emitStderr } = makeChildProcess();

        const largeOutput = 'x'.repeat(2048);
        const promise = waitForProcess(child, 'test-process');
        emitStderr(largeOutput);
        emitClose(1);

        let errorMessage = '';
        try {
            await promise;
        } catch (e: unknown) {
            errorMessage = (e as Error).message;
        }
        // Error message should not contain the full 2048-char output (truncated to 1024)
        expect(errorMessage.length).toBeLessThan(1200);
    });
});
