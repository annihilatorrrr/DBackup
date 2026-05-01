import { describe, it, expect, vi } from 'vitest';
import { prismaMock } from '@/lib/testing/prisma-mock';
import {
    SystemTaskService,
    SYSTEM_TASKS,
    DEFAULT_TASK_CONFIG,
} from '@/services/system/system-task-service';

// Mock all heavy dependencies - we only test the getter/setter logic here
vi.mock('@/lib/core/registry', () => ({ registry: { get: vi.fn() } }));
vi.mock('@/lib/adapters', () => ({ registerAdapters: vi.fn() }));
vi.mock('@/lib/adapters/config-resolver', () => ({ resolveAdapterConfig: vi.fn() }));
vi.mock('@/services/system/update-service', () => ({
    updateService: { checkForUpdates: vi.fn().mockResolvedValue({ updateAvailable: false }) },
}));
vi.mock('@/services/system/healthcheck-service', () => ({
    healthCheckService: { performHealthCheck: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/audit-service', () => ({
    auditService: { cleanOldLogs: vi.fn().mockResolvedValue({ count: 0 }) },
}));
vi.mock('@/services/notifications/system-notification-service', () => ({
    notify: vi.fn(),
    getNotificationConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/notifications/events', () => ({
    getEventDefinition: vi.fn().mockReturnValue(null),
}));
vi.mock('@/lib/auth/permissions', () => ({
    PERMISSIONS: { SYSTEM: { ADMIN: 'system.admin' } },
}));

// Dynamic-import mocks (used inside runTask() switch branches)
vi.mock('@/lib/runner/config-runner', () => ({
    runConfigBackup: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/backup/integrity-service', () => ({
    integrityService: {
        runFullIntegrityCheck: vi.fn().mockResolvedValue({ totalFiles: 5, passed: 5, failed: 0, skipped: 0 }),
    },
}));
vi.mock('@/services/dashboard-service', () => ({
    refreshStorageStatsCache: vi.fn().mockResolvedValue(undefined),
    cleanupOldSnapshots: vi.fn().mockResolvedValue(3),
}));

describe('SystemTaskService', () => {
    let service: SystemTaskService;

    beforeEach(() => {
        service = new SystemTaskService();
    });

    describe('getTaskEnabled()', () => {
        it('returns true from DB setting when set', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue({ key: 'task.x.enabled', value: 'true' } as any);

            const result = await service.getTaskEnabled(SYSTEM_TASKS.HEALTH_CHECK);

            expect(result).toBe(true);
        });

        it('returns false from DB setting when set to false', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue({ key: 'task.x.enabled', value: 'false' } as any);

            const result = await service.getTaskEnabled(SYSTEM_TASKS.HEALTH_CHECK);

            expect(result).toBe(false);
        });

        it('returns default config value when no DB setting exists', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue(null);

            const result = await service.getTaskEnabled(SYSTEM_TASKS.HEALTH_CHECK);

            expect(result).toBe(DEFAULT_TASK_CONFIG[SYSTEM_TASKS.HEALTH_CHECK].enabled);
        });

        it('uses legacy key for CONFIG_BACKUP', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue({ key: 'config.backup.enabled', value: 'true' } as any);

            const result = await service.getTaskEnabled(SYSTEM_TASKS.CONFIG_BACKUP);

            expect(prismaMock.systemSetting.findUnique).toHaveBeenCalledWith({
                where: { key: 'config.backup.enabled' },
            });
            expect(result).toBe(true);
        });
    });

    describe('setTaskEnabled()', () => {
        it('upserts task enabled setting', async () => {
            prismaMock.systemSetting.upsert.mockResolvedValue({} as any);

            await service.setTaskEnabled(SYSTEM_TASKS.HEALTH_CHECK, true);

            expect(prismaMock.systemSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: `task.${SYSTEM_TASKS.HEALTH_CHECK}.enabled` },
                    update: { value: 'true' },
                })
            );
        });

        it('uses legacy key for CONFIG_BACKUP', async () => {
            prismaMock.systemSetting.upsert.mockResolvedValue({} as any);

            await service.setTaskEnabled(SYSTEM_TASKS.CONFIG_BACKUP, false);

            expect(prismaMock.systemSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'config.backup.enabled' },
                    update: { value: 'false' },
                })
            );
        });
    });

    describe('getTaskConfig()', () => {
        it('returns schedule from DB when set', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue({ key: 'task.x.schedule', value: '0 5 * * *' } as any);

            const result = await service.getTaskConfig(SYSTEM_TASKS.HEALTH_CHECK);

            expect(result).toBe('0 5 * * *');
        });

        it('returns default interval when DB has no entry', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue(null);

            const result = await service.getTaskConfig(SYSTEM_TASKS.HEALTH_CHECK);

            expect(result).toBe(DEFAULT_TASK_CONFIG[SYSTEM_TASKS.HEALTH_CHECK].interval);
        });
    });

    describe('getTaskRunOnStartup()', () => {
        it('returns true from DB when set', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue({ key: 'task.x.runOnStartup', value: 'true' } as any);

            const result = await service.getTaskRunOnStartup(SYSTEM_TASKS.CLEAN_OLD_LOGS);

            expect(result).toBe(true);
        });

        it('returns default when no DB entry', async () => {
            prismaMock.systemSetting.findUnique.mockResolvedValue(null);

            const result = await service.getTaskRunOnStartup(SYSTEM_TASKS.CLEAN_OLD_LOGS);

            expect(result).toBe(DEFAULT_TASK_CONFIG[SYSTEM_TASKS.CLEAN_OLD_LOGS].runOnStartup);
        });
    });

    describe('setTaskConfig()', () => {
        it('upserts schedule setting', async () => {
            prismaMock.systemSetting.upsert.mockResolvedValue({} as any);

            await service.setTaskConfig(SYSTEM_TASKS.HEALTH_CHECK, '*/5 * * * *');

            expect(prismaMock.systemSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: `task.${SYSTEM_TASKS.HEALTH_CHECK}.schedule` },
                    update: { value: '*/5 * * * *' },
                })
            );
        });
    });

    describe('SYSTEM_TASKS constants', () => {
        it('exports the expected task identifiers', () => {
            expect(SYSTEM_TASKS.HEALTH_CHECK).toBeDefined();
            expect(SYSTEM_TASKS.CLEAN_OLD_LOGS).toBeDefined();
            expect(SYSTEM_TASKS.CHECK_FOR_UPDATES).toBeDefined();
            expect(SYSTEM_TASKS.SYNC_PERMISSIONS).toBeDefined();
            expect(SYSTEM_TASKS.UPDATE_DB_VERSIONS).toBeDefined();
        });
    });

    describe('DEFAULT_TASK_CONFIG', () => {
        it('has a config entry for each SYSTEM_TASK', () => {
            for (const taskId of Object.values(SYSTEM_TASKS)) {
                expect(DEFAULT_TASK_CONFIG[taskId as keyof typeof DEFAULT_TASK_CONFIG]).toBeDefined();
            }
        });

        it('each config has an interval, runOnStartup and enabled field', () => {
            for (const config of Object.values(DEFAULT_TASK_CONFIG)) {
                expect(config.interval).toBeTruthy();
                expect(typeof config.runOnStartup).toBe('boolean');
                expect(typeof config.enabled).toBe('boolean');
            }
        });
    });

    describe('runTask()', () => {
        it('calls healthCheckService.performHealthCheck for HEALTH_CHECK', async () => {
            const { healthCheckService } = await import('@/services/system/healthcheck-service');

            await service.runTask(SYSTEM_TASKS.HEALTH_CHECK);

            expect(healthCheckService.performHealthCheck).toHaveBeenCalledTimes(1);
        });

        it('calls auditService.cleanOldLogs for CLEAN_OLD_LOGS', async () => {
            const { auditService } = await import('@/services/audit-service');
            prismaMock.systemSetting.findUnique.mockResolvedValue(null);
            prismaMock.notificationLog.deleteMany.mockResolvedValue({ count: 0 });

            await service.runTask(SYSTEM_TASKS.CLEAN_OLD_LOGS);

            expect(auditService.cleanOldLogs).toHaveBeenCalled();
        });

        it('cleans notification logs with custom retention days', async () => {
            prismaMock.systemSetting.findUnique
                .mockResolvedValueOnce(null) // audit retention
                .mockResolvedValueOnce(null) // snapshot retention
                .mockResolvedValueOnce({ key: 'notification.logRetentionDays', value: '30' } as any);
            prismaMock.notificationLog.deleteMany.mockResolvedValue({ count: 5 });

            await service.runTask(SYSTEM_TASKS.CLEAN_OLD_LOGS);

            expect(prismaMock.notificationLog.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { sentAt: { lt: expect.any(Date) } } })
            );
        });

        it('calls updateService.checkForUpdates for CHECK_FOR_UPDATES', async () => {
            const { updateService } = await import('@/services/system/update-service');

            await service.runTask(SYSTEM_TASKS.CHECK_FOR_UPDATES);

            expect(updateService.checkForUpdates).toHaveBeenCalledTimes(1);
        });

        it('calls prisma.group.updateMany for SYNC_PERMISSIONS', async () => {
            prismaMock.group.updateMany.mockResolvedValue({ count: 1 });

            await service.runTask(SYSTEM_TASKS.SYNC_PERMISSIONS);

            expect(prismaMock.group.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { name: 'SuperAdmin' } })
            );
        });

        it('calls runConfigBackup for CONFIG_BACKUP', async () => {
            const { runConfigBackup } = await import('@/lib/runner/config-runner');

            await service.runTask(SYSTEM_TASKS.CONFIG_BACKUP);

            expect(runConfigBackup).toHaveBeenCalledTimes(1);
        });

        it('calls integrityService.runFullIntegrityCheck for INTEGRITY_CHECK', async () => {
            const { integrityService } = await import('@/services/backup/integrity-service');

            await service.runTask(SYSTEM_TASKS.INTEGRITY_CHECK);

            expect(integrityService.runFullIntegrityCheck).toHaveBeenCalledTimes(1);
        });

        it('calls refreshStorageStatsCache for REFRESH_STORAGE_STATS', async () => {
            const { refreshStorageStatsCache } = await import('@/services/dashboard-service');

            await service.runTask(SYSTEM_TASKS.REFRESH_STORAGE_STATS);

            expect(refreshStorageStatsCache).toHaveBeenCalledTimes(1);
        });

        it('does not throw for unknown task id', async () => {
            await expect(service.runTask('system.unknown_task')).resolves.toBeUndefined();
        });

        it('handles SYNC_PERMISSIONS with no SuperAdmin group gracefully', async () => {
            prismaMock.group.updateMany.mockResolvedValue({ count: 0 });

            await expect(service.runTask(SYSTEM_TASKS.SYNC_PERMISSIONS)).resolves.toBeUndefined();
        });

        it('handles CLEAN_OLD_LOGS when auditService throws without propagating', async () => {
            const { auditService } = await import('@/services/audit-service');
            vi.mocked(auditService.cleanOldLogs).mockRejectedValue(new Error('DB error'));
            prismaMock.notificationLog.deleteMany.mockResolvedValue({ count: 0 });

            await expect(service.runTask(SYSTEM_TASKS.CLEAN_OLD_LOGS)).resolves.toBeUndefined();
        });

        it('updates database versions for UPDATE_DB_VERSIONS with empty source list', async () => {
            prismaMock.adapterConfig.findMany.mockResolvedValue([]);

            await expect(service.runTask(SYSTEM_TASKS.UPDATE_DB_VERSIONS)).resolves.toBeUndefined();
        });
    });
});
