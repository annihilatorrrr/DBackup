import prisma from "@/lib/prisma";
import { registry } from "@/lib/core/registry";
import { decryptConfig } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { wrapError, getErrorMessage } from "@/lib/errors";

const log = logger.child({ service: "HealthCheckService" });

// Timeout for individual adapter health checks (15 seconds)
const ADAPTER_CHECK_TIMEOUT_MS = 15_000;
// Maximum number of concurrent health checks
const MAX_CONCURRENT_CHECKS = 5;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms for ${label}`)), ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

export class HealthCheckService {
    async performHealthCheck() {
        log.debug("Starting health check cycle");
        const configs = await prisma.adapterConfig.findMany({
            where: {
                OR: [
                    { type: 'database' },
                    { type: 'storage' }
                ]
            }
        });

        // Run checks in parallel batches to avoid blocking the event loop serially
        for (let i = 0; i < configs.length; i += MAX_CONCURRENT_CHECKS) {
            const batch = configs.slice(i, i + MAX_CONCURRENT_CHECKS);
            await Promise.allSettled(batch.map(config => this.checkAdapter(config)));
        }

        // Retention Policy: Delete logs older than 48 hours
        try {
            const retentionDate = new Date();
            retentionDate.setHours(retentionDate.getHours() - 48);

            const deleted = await prisma.healthCheckLog.deleteMany({
                where: {
                    createdAt: {
                        lt: retentionDate
                    }
                }
            });
            if (deleted.count > 0) {
                log.info("Cleaned up old health check logs", { deletedCount: deleted.count });
            }
        } catch (e) {
            log.error("Failed to run log retention", {}, wrapError(e));
        }

        log.debug("Health check cycle completed");
    }

    private async checkAdapter(configRow: any) {
        let latency = 0;
        let errorMsg: string | null = null;
        let success = false;

        try {
            const adapter = registry.get(configRow.adapterId);
            if (!adapter) {
                throw new Error(`Adapter ${configRow.adapterId} not found`);
            }

            if (!adapter.test) {
                // If ping/test not supported, we skip
                return;
            }

             // Decrypt config
            let config;
            try {
                config = decryptConfig(JSON.parse(configRow.config));
            } catch(e: unknown) {
                throw new Error(`Config decrypt failed: ${getErrorMessage(e)}`);
            }

            const start = Date.now();
            const result = await withTimeout(
                adapter.test(config),
                ADAPTER_CHECK_TIMEOUT_MS,
                configRow.name || configRow.id
            );
            const end = Date.now();
            latency = end - start;

            success = result.success;
            if (!success) {
                errorMsg = result.message;
            }

        } catch (e: unknown) {
            success = false;
            errorMsg = getErrorMessage(e);
        }

        // Status Logic
        let newStatus = 'ONLINE';
        const consecutiveFailures = success ? 0 : (configRow.consecutiveFailures + 1);

        if (!success) {
            if (consecutiveFailures >= 3) {
                newStatus = 'OFFLINE';
            } else {
                newStatus = 'DEGRADED';
            }
        }

        try {
            // Update DB
            await prisma.$transaction([
                prisma.healthCheckLog.create({
                    data: {
                        adapterConfigId: configRow.id,
                        status: newStatus as any,
                        latencyMs: latency,
                        error: errorMsg
                    }
                }),
                prisma.adapterConfig.update({
                    where: { id: configRow.id },
                    data: {
                        lastHealthCheck: new Date(),
                        lastStatus: newStatus as any,
                        consecutiveFailures: consecutiveFailures
                    }
                })
            ]);
        } catch (e) {
            log.error("Failed to update health check status", { configName: configRow.name }, wrapError(e));
        }
    }
}

export const healthCheckService = new HealthCheckService();
