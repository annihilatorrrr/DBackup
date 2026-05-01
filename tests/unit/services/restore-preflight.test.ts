import { describe, it, expect, vi } from 'vitest';
import { prismaMock } from '@/lib/testing/prisma-mock';
import { preflightRestore } from '@/services/restore/preflight';
import { registry } from '@/lib/core/registry';
import { resolveAdapterConfig } from '@/lib/adapters/config-resolver';

vi.mock('@/lib/core/registry', () => ({
    registry: {
        get: vi.fn(),
    },
}));

vi.mock('@/lib/adapters/config-resolver', () => ({
    resolveAdapterConfig: vi.fn().mockResolvedValue({ host: 'localhost' }),
}));

const mockDbConfig = {
    id: 'target-1',
    adapterId: 'postgres',
    type: 'database',
    name: 'Target DB',
    config: '{}',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockStorageConfig = {
    id: 'storage-1',
    adapterId: 's3',
    type: 'storage',
    name: 'S3 Storage',
    config: '{}',
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('preflightRestore()', () => {
    it('throws if target source is not found', async () => {
        prismaMock.adapterConfig.findUnique.mockResolvedValue(null);

        await expect(
            preflightRestore({ storageConfigId: 'st-1', file: '/backup.sql', targetSourceId: 'missing' })
        ).rejects.toThrow('Target source not found');
    });

    it('resolves without calling prepareRestore if target is not a database type', async () => {
        prismaMock.adapterConfig.findUnique.mockResolvedValue({
            ...mockDbConfig,
            type: 'storage',
        } as any);
        vi.mocked(registry.get).mockReturnValue(undefined as any);

        await expect(
            preflightRestore({ storageConfigId: 'st-1', file: '/backup.sql', targetSourceId: 'target-1' })
        ).resolves.toBeUndefined();
    });

    it('calls prepareRestore with targetDatabaseName when provided', async () => {
        const prepareRestore = vi.fn().mockResolvedValue(undefined);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockDbConfig as any);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(null);
        vi.mocked(registry.get).mockReturnValue({ prepareRestore } as any);

        await preflightRestore({
            storageConfigId: 'st-1',
            file: '/backup.sql',
            targetSourceId: 'target-1',
            targetDatabaseName: 'my_db',
        });

        expect(prepareRestore).toHaveBeenCalledWith(
            expect.any(Object),
            ['my_db']
        );
    });

    it('throws on incompatible source/target database types', async () => {
        const testFn = vi.fn().mockResolvedValue({ success: true, version: '14.0' });
        const readFn = vi.fn().mockResolvedValue(JSON.stringify({
            sourceType: 'mysql',
            engineVersion: '8.0',
        }));

        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockDbConfig as any);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockStorageConfig as any);

        vi.mocked(registry.get)
            .mockReturnValueOnce(undefined as any) // no prepareRestore adapter
            .mockReturnValueOnce({ read: readFn } as any)
            .mockReturnValueOnce({ test: testFn } as any);

        await expect(
            preflightRestore({
                storageConfigId: 'st-1',
                file: '/backup.sql',
                targetSourceId: 'target-1',
                targetDatabaseName: 'my_db',
            })
        ).rejects.toThrow("Incompatible database types");
    });

    it('throws when backup version is newer than target server version', async () => {
        const testFn = vi.fn().mockResolvedValue({ success: true, version: '13.0' });
        const readFn = vi.fn().mockResolvedValue(JSON.stringify({
            sourceType: 'postgres',
            engineVersion: '15.0',
        }));

        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockDbConfig as any);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockStorageConfig as any);

        vi.mocked(registry.get)
            .mockReturnValueOnce(undefined as any)
            .mockReturnValueOnce({ read: readFn } as any)
            .mockReturnValueOnce({ test: testFn } as any);

        await expect(
            preflightRestore({
                storageConfigId: 'st-1',
                file: '/backup.sql',
                targetSourceId: 'target-1',
                targetDatabaseName: 'my_db',
            })
        ).rejects.toThrow('not recommended');
    });

    it('succeeds when backup version matches target server version', async () => {
        const testFn = vi.fn().mockResolvedValue({ success: true, version: '14.5' });
        const readFn = vi.fn().mockResolvedValue(JSON.stringify({
            sourceType: 'postgres',
            engineVersion: '14.5',
        }));

        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockDbConfig as any);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockStorageConfig as any);

        vi.mocked(registry.get)
            .mockReturnValueOnce(undefined as any)
            .mockReturnValueOnce({ read: readFn } as any)
            .mockReturnValueOnce({ test: testFn } as any);

        await expect(
            preflightRestore({
                storageConfigId: 'st-1',
                file: '/backup.sql',
                targetSourceId: 'target-1',
                targetDatabaseName: 'my_db',
            })
        ).resolves.toBeUndefined();
    });

    it('skips version check gracefully when meta file is missing', async () => {
        const readFn = vi.fn().mockResolvedValue(null);

        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockDbConfig as any);
        prismaMock.adapterConfig.findUnique.mockResolvedValueOnce(mockStorageConfig as any);

        vi.mocked(registry.get)
            .mockReturnValueOnce(undefined as any)
            .mockReturnValueOnce({ read: readFn } as any)
            .mockReturnValueOnce({ test: vi.fn() } as any);

        await expect(
            preflightRestore({
                storageConfigId: 'st-1',
                file: '/backup.sql',
                targetSourceId: 'target-1',
            })
        ).resolves.toBeUndefined();
    });
});
