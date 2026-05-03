import { describe, it, expect, vi, beforeEach } from 'vitest';
import { integrityService } from '@/services/backup/integrity-service';
import prisma from '@/lib/prisma';
import { registry } from '@/lib/core/registry';

vi.mock('@/lib/prisma', () => ({
    default: {
        adapterConfig: { findMany: vi.fn() },
        job: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/core/registry', () => ({
    registry: { get: vi.fn() },
}));

vi.mock('@/lib/adapters', () => ({
    registerAdapters: vi.fn(),
}));

vi.mock('@/lib/adapters/config-resolver', () => ({
    resolveAdapterConfig: vi.fn().mockResolvedValue({ bucket: 'test' }),
}));

vi.mock('@/lib/temp-dir', () => ({
    getTempDir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('@/lib/crypto/checksum', () => ({
    verifyFileChecksum: vi.fn(),
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
    wrapError: vi.fn((e) => e),
}));

// Shared mock functions hoisted so they're available when vi.mock factories run
const { mockFsReadFile, mockFsUnlink } = vi.hoisted(() => ({
    mockFsReadFile: vi.fn(),
    mockFsUnlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
    default: {
        promises: {
            readFile: mockFsReadFile,
            unlink: mockFsUnlink,
        },
    },
    promises: {
        readFile: mockFsReadFile,
        unlink: mockFsUnlink,
    },
}));

describe('IntegrityService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function makeStorageAdapter(overrides: Record<string, unknown> = {}) {
        return {
            list: vi.fn(),
            download: vi.fn(),
            read: vi.fn(),
            upload: vi.fn(),
            delete: vi.fn(),
            ...overrides,
        };
    }

    it('returns zero counts when no storage destinations exist', async () => {
        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.totalFiles).toBe(0);
        expect(result.passed).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.skipped).toBe(0);
    });

    it('skips files without checksum metadata', async () => {
        const adapter = makeStorageAdapter({
            list: vi.fn()
                .mockResolvedValueOnce([{ name: 'My Job' }]) // top-level folder
                .mockResolvedValueOnce([{ name: 'backup.sql' }]), // files in folder
            read: vi.fn().mockResolvedValue(null),
            download: vi.fn().mockResolvedValue(false), // no metadata download
        });

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Local', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.totalFiles).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.verified).toBe(0);
    });

    it('passes file that matches checksum', async () => {
        const { verifyFileChecksum } = await import('@/lib/crypto/checksum');

        const metaJson = JSON.stringify({ checksum: 'sha256:abc123' });

        const adapter = makeStorageAdapter({
            list: vi.fn()
                .mockResolvedValueOnce([{ name: 'My Job' }])
                .mockResolvedValueOnce([{ name: 'backup.sql' }]),
            read: vi.fn().mockResolvedValue(metaJson),
            download: vi.fn().mockResolvedValue(true),
        });

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Local', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(adapter);
        (verifyFileChecksum as ReturnType<typeof vi.fn>).mockResolvedValue({
            valid: true,
            expected: 'sha256:abc123',
            actual: 'sha256:abc123',
        });

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.totalFiles).toBe(1);
        expect(result.verified).toBe(1);
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it('records failed file when checksum mismatch', async () => {
        const { verifyFileChecksum } = await import('@/lib/crypto/checksum');

        const metaJson = JSON.stringify({ checksum: 'sha256:correct' });

        const adapter = makeStorageAdapter({
            list: vi.fn()
                .mockResolvedValueOnce([{ name: 'Jobs' }])
                .mockResolvedValueOnce([{ name: 'backup.sql' }]),
            read: vi.fn().mockResolvedValue(metaJson),
            download: vi.fn().mockResolvedValue(true),
        });

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Storage1', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(adapter);
        (verifyFileChecksum as ReturnType<typeof vi.fn>).mockResolvedValue({
            valid: false,
            expected: 'sha256:correct',
            actual: 'sha256:tampered',
        });

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.failed).toBe(1);
        expect(result.passed).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].file).toBe('backup.sql');
        expect(result.errors[0].destination).toBe('Storage1');
        expect(result.errors[0].expected).toBe('sha256:correct');
        expect(result.errors[0].actual).toBe('sha256:tampered');
    });

    it('falls back to job names when listing storage root fails', async () => {
        const adapter = makeStorageAdapter({
            list: vi.fn()
                .mockRejectedValueOnce(new Error('Permission denied')) // root listing fails
                .mockResolvedValueOnce([{ name: 'backup.sql' }]), // folder listing succeeds
            read: vi.fn().mockResolvedValue(null),
            download: vi.fn().mockResolvedValue(false),
        });

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Local', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (prisma.job.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { name: 'Fallback Job' },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

        const result = await integrityService.runFullIntegrityCheck();

        // Fallback to job names was used - listing should have been attempted for 'Fallback Job'
        expect(prisma.job.findMany).toHaveBeenCalled();
        expect(result.totalFiles).toBe(1);
        expect(result.skipped).toBe(1);
    });

    it('skips unknown storage adapter (not in registry)', async () => {
        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's2', adapterId: 'unknown-adapter', name: 'Unknown', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.totalFiles).toBe(0);
    });

    it('continues checking other destinations when one throws', async () => {
        const failingAdapter = makeStorageAdapter({
            list: vi.fn().mockRejectedValue(new Error('Storage crash')),
        });
        const passingAdapter = makeStorageAdapter({
            list: vi.fn()
                .mockResolvedValueOnce([{ name: 'Jobs' }])
                .mockResolvedValueOnce([]),
        });

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'bad', name: 'Bad Storage', config: '{}', primaryCredentialId: null, sshCredentialId: null },
            { id: 's2', adapterId: 'good', name: 'Good Storage', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce(failingAdapter)
            .mockReturnValueOnce(passingAdapter);

        await expect(integrityService.runFullIntegrityCheck()).resolves.not.toThrow();
    });

    it('uses download fallback for metadata when adapter has no read() method', async () => {
        const { verifyFileChecksum } = await import('@/lib/crypto/checksum');

        const metaJson = JSON.stringify({ checksum: 'sha256:xyz' });

        const adapter = makeStorageAdapter({
            read: undefined, // No read() method
            list: vi.fn()
                .mockResolvedValueOnce([{ name: 'Folder' }])
                .mockResolvedValueOnce([{ name: 'backup.sql' }]),
            download: vi.fn().mockResolvedValue(true),
        });
        mockFsReadFile.mockResolvedValue(metaJson);

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Local', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>).mockReturnValue(adapter);
        (verifyFileChecksum as ReturnType<typeof vi.fn>).mockResolvedValue({
            valid: true,
            expected: 'sha256:xyz',
            actual: 'sha256:xyz',
        });

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.passed).toBe(1);
    });

    it('accumulates results across multiple destinations', async () => {
        const { verifyFileChecksum } = await import('@/lib/crypto/checksum');

        const metaJson = JSON.stringify({ checksum: 'sha256:ok' });

        function makePassingAdapter() {
            return makeStorageAdapter({
                list: vi.fn()
                    .mockResolvedValueOnce([{ name: 'Folder' }])
                    .mockResolvedValueOnce([{ name: 'backup.sql' }]),
                read: vi.fn().mockResolvedValue(metaJson),
                download: vi.fn().mockResolvedValue(true),
            });
        }

        (prisma.adapterConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 's1', adapterId: 'local', name: 'Dest1', config: '{}', primaryCredentialId: null, sshCredentialId: null },
            { id: 's2', adapterId: 'local', name: 'Dest2', config: '{}', primaryCredentialId: null, sshCredentialId: null },
        ]);
        (registry.get as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce(makePassingAdapter())
            .mockReturnValueOnce(makePassingAdapter());
        (verifyFileChecksum as ReturnType<typeof vi.fn>).mockResolvedValue({
            valid: true,
            expected: 'sha256:ok',
            actual: 'sha256:ok',
        });

        const result = await integrityService.runFullIntegrityCheck();

        expect(result.totalFiles).toBe(2);
        expect(result.passed).toBe(2);
    });
});
