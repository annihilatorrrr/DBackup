import { describe, it, expect, vi } from 'vitest';
import { prismaMock } from '@/lib/testing/prisma-mock';
import { AuditService } from '@/services/audit-service';

describe('AuditService', () => {
    let service: AuditService;

    beforeEach(() => {
        service = new AuditService();
    });

    describe('log()', () => {
        it('creates an audit log entry with all fields', async () => {
            prismaMock.auditLog.create.mockResolvedValue({} as any);

            await service.log('user-1', 'CREATE', 'Job', { ipAddress: '127.0.0.1', userAgent: 'Mozilla' }, 'res-1');

            expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: 'user-1',
                    action: 'CREATE',
                    resource: 'Job',
                    resourceId: 'res-1',
                    ipAddress: '127.0.0.1',
                    userAgent: 'Mozilla',
                }),
            });
        });

        it('creates an audit log entry with null userId', async () => {
            prismaMock.auditLog.create.mockResolvedValue({} as any);

            await service.log(null, 'LOGIN', 'Auth');

            expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ userId: null, action: 'LOGIN', resource: 'Auth' }),
            });
        });

        it('does not throw if prisma.auditLog.create fails', async () => {
            prismaMock.auditLog.create.mockRejectedValue(new Error('DB error'));

            await expect(service.log('user-1', 'DELETE', 'Backup')).resolves.toBeUndefined();
        });
    });

    describe('getLogs()', () => {
        const mockLogs = [{ id: 'log-1', action: 'CREATE', resource: 'Job', createdAt: new Date(), user: null }];

        it('returns paginated logs with default filter', async () => {
            prismaMock.auditLog.findMany.mockResolvedValue(mockLogs as any);
            prismaMock.auditLog.count.mockResolvedValue(1);

            const result = await service.getLogs();

            expect(result.logs).toEqual(mockLogs);
            expect(result.pagination.total).toBe(1);
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.limit).toBe(20);
        });

        it('applies userId filter', async () => {
            prismaMock.auditLog.findMany.mockResolvedValue([]);
            prismaMock.auditLog.count.mockResolvedValue(0);

            await service.getLogs({ userId: 'user-42' });

            expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ userId: 'user-42' }) })
            );
        });

        it('applies date range filter', async () => {
            prismaMock.auditLog.findMany.mockResolvedValue([]);
            prismaMock.auditLog.count.mockResolvedValue(0);

            const start = new Date('2026-01-01');
            const end = new Date('2026-12-31');
            await service.getLogs({ startDate: start, endDate: end });

            expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        createdAt: { gte: start, lte: end },
                    }),
                })
            );
        });

        it('applies search filter using OR clause', async () => {
            prismaMock.auditLog.findMany.mockResolvedValue([]);
            prismaMock.auditLog.count.mockResolvedValue(0);

            await service.getLogs({ search: 'test' });

            expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ OR: expect.any(Array) }),
                })
            );
        });

        it('calculates correct page count', async () => {
            prismaMock.auditLog.findMany.mockResolvedValue([]);
            prismaMock.auditLog.count.mockResolvedValue(45);

            const result = await service.getLogs({ limit: 20 });

            expect(result.pagination.pages).toBe(3);
        });
    });

    describe('cleanOldLogs()', () => {
        it('deletes logs older than the retention days', async () => {
            prismaMock.auditLog.deleteMany.mockResolvedValue({ count: 5 });

            const result = await service.cleanOldLogs(30);

            expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            });
            expect(result.count).toBe(5);
        });
    });

    describe('getFilterStats()', () => {
        it('returns actions and resources', async () => {
            prismaMock.auditLog.groupBy.mockResolvedValue([
                { action: 'CREATE', _count: { action: 3 } } as any,
            ]);

            const result = await service.getFilterStats();

            expect(result.actions).toEqual([{ value: 'CREATE', count: 3 }]);
        });
    });
});
