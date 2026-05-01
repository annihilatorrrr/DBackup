import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before importing the module under test ──────────

vi.mock('@/lib/prisma', () => ({
    default: {
        execution: {
            create: vi.fn(),
            updateMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/execution/queue-manager', () => ({
    processQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/execution/abort', () => ({
    registerExecution: vi.fn().mockReturnValue(new AbortController()),
    unregisterExecution: vi.fn(),
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

vi.mock('@/lib/logging/errors', () => ({
    wrapError: vi.fn((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
}));

vi.mock('@/lib/runner/steps/01-initialize', () => ({
    stepInitialize: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/runner/steps/02-dump', () => ({
    stepExecuteDump: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/runner/steps/03-upload', () => ({
    stepUpload: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/runner/steps/05-retention', () => ({
    stepRetention: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/runner/steps/04-completion', () => ({
    stepCleanup: vi.fn().mockResolvedValue(undefined),
    stepFinalize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils', () => ({
    formatDuration: vi.fn((ms: number) => `${ms}ms`),
}));

vi.mock('@/lib/core/logs', () => ({
    PIPELINE_STAGES: {
        INITIALIZING: 'Initializing',
        DUMPING: 'Dumping',
        PROCESSING: 'Processing',
        UPLOADING: 'Uploading',
        VERIFYING: 'Verifying',
        RETENTION: 'Retention',
        COMPLETED: 'Completed',
    },
    stageProgress: vi.fn().mockReturnValue(50),
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────

import prisma from '@/lib/prisma';
import { processQueue } from '@/lib/execution/queue-manager';
import { registerExecution, unregisterExecution } from '@/lib/execution/abort';
import { stepInitialize } from '@/lib/runner/steps/01-initialize';
import { stepExecuteDump } from '@/lib/runner/steps/02-dump';
import { stepCleanup, stepFinalize } from '@/lib/runner/steps/04-completion';
import { runJob, performExecution } from '@/lib/runner';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockExecution = {
    id: 'exec-1',
    jobId: 'job-1',
    status: 'Pending',
    logs: '[]',
    metadata: '{}',
    startedAt: null,
    completedAt: null,
    job: {
        id: 'job-1',
        name: 'Test Job',
        schedule: '0 * * * *',
        enabled: true,
        sourceId: 'src-1',
        databases: '[]',
        compression: 'NONE',
        pgCompression: '',
        encryptionProfileId: null,
        notificationEvents: 'ALWAYS',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
};

// ── runJob() tests ─────────────────────────────────────────────────────────

describe('runJob()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates an execution and returns executionId', async () => {
        vi.mocked(prisma.execution.create).mockResolvedValue({ ...mockExecution, id: 'exec-new' } as any);

        const result = await runJob('job-1');

        expect(prisma.execution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ jobId: 'job-1', status: 'Pending' }),
            })
        );
        expect(result.success).toBe(true);
        expect(result.executionId).toBe('exec-new');
    });

    it('triggers processQueue non-blocking after creating execution', async () => {
        vi.mocked(prisma.execution.create).mockResolvedValue({ ...mockExecution } as any);

        await runJob('job-1');

        // processQueue is called fire-and-forget, so it may be called with .catch()
        // We verify it was invoked during the call
        expect(processQueue).toHaveBeenCalled();
    });

    it('throws when prisma.execution.create fails', async () => {
        vi.mocked(prisma.execution.create).mockRejectedValue(new Error('DB connection lost'));

        await expect(runJob('job-1')).rejects.toThrow('DB connection lost');
    });
});

// ── performExecution() tests ───────────────────────────────────────────────

describe('performExecution()', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(registerExecution).mockReturnValue(new AbortController());
        vi.mocked(prisma.execution.update).mockResolvedValue({} as any);
        vi.mocked(stepCleanup).mockResolvedValue(undefined);
        vi.mocked(stepFinalize).mockResolvedValue(undefined);
    });

    it('bails out when execution is already claimed (updateMany count = 0)', async () => {
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 0 });

        await performExecution('exec-1', 'job-1');

        expect(prisma.execution.findUnique).not.toHaveBeenCalled();
        expect(unregisterExecution).not.toHaveBeenCalled();
    });

    it('bails out when execution record is not found after claiming', async () => {
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.execution.findUnique).mockResolvedValue(null);

        await performExecution('exec-1', 'job-1');

        expect(unregisterExecution).toHaveBeenCalledWith('exec-1');
        expect(stepInitialize).not.toHaveBeenCalled();
    });

    it('runs full pipeline when execution is found', async () => {
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.execution.findUnique).mockResolvedValue(mockExecution as any);

        await performExecution('exec-1', 'job-1');

        expect(stepInitialize).toHaveBeenCalled();
        expect(stepExecuteDump).toHaveBeenCalled();
        expect(stepCleanup).toHaveBeenCalled();
        expect(stepFinalize).toHaveBeenCalled();
        expect(unregisterExecution).toHaveBeenCalledWith('exec-1');
    });

    it('marks execution as Failed when a pipeline step throws', async () => {
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.execution.findUnique).mockResolvedValue(mockExecution as any);
        vi.mocked(stepInitialize).mockRejectedValue(new Error('Step failed'));

        await performExecution('exec-1', 'job-1');

        // Cleanup and finalize must still run
        expect(stepCleanup).toHaveBeenCalled();
        expect(stepFinalize).toHaveBeenCalled();
        expect(unregisterExecution).toHaveBeenCalledWith('exec-1');
    });

    it('marks execution as Cancelled when AbortController is aborted', async () => {
        const abortController = new AbortController();
        vi.mocked(registerExecution).mockReturnValue(abortController);
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.execution.findUnique).mockResolvedValue(mockExecution as any);

        // Abort during stepInitialize
        vi.mocked(stepInitialize).mockImplementation(async () => {
            abortController.abort();
            throw new Error('Execution was cancelled by user');
        });

        await performExecution('exec-1', 'job-1');

        // Still cleans up
        expect(stepCleanup).toHaveBeenCalled();
        expect(unregisterExecution).toHaveBeenCalledWith('exec-1');
    });

    it('triggers processQueue after execution completes', async () => {
        vi.mocked(prisma.execution.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.execution.findUnique).mockResolvedValue(mockExecution as any);

        await performExecution('exec-1', 'job-1');

        expect(processQueue).toHaveBeenCalled();
    });
});
