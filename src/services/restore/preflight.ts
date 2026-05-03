import prisma from "@/lib/prisma";
import { registry } from "@/lib/core/registry";
import { StorageAdapter, DatabaseAdapter, BackupMetadata } from "@/lib/core/interfaces";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import { compareVersions } from "@/lib/utils";
import { logger } from "@/lib/logging/logger";
import { wrapError, getErrorMessage } from "@/lib/logging/errors";
import type { RestoreInput } from "./types";

const svcLog = logger.child({ service: "RestoreService" });

/**
 * Pre-flight checks before kicking off a restore:
 *  - prepareRestore() permission probe (CREATE DATABASE / overwrite rights)
 *  - cross-vendor type guard (e.g. MySQL → MariaDB rejected)
 *  - engine version compatibility (newer dump on older server is blocked)
 *  - MSSQL Azure SQL Edge ↔ SQL Server edition guard
 *
 * Throws on incompatibility so the caller fails fast before logging an Execution.
 */
export async function preflightRestore(input: RestoreInput): Promise<void> {
    const { file, storageConfigId, targetSourceId, targetDatabaseName, databaseMapping, privilegedAuth } = input;

    const targetConfig = await prisma.adapterConfig.findUnique({ where: { id: targetSourceId } });
    if (!targetConfig) throw new Error("Target source not found");

    if (targetConfig.type === 'database') {
        const targetAdapter = registry.get(targetConfig.adapterId) as DatabaseAdapter;
        if (targetAdapter && targetAdapter.prepareRestore) {
            let dbsToCheck: string[] = [];

            if (Array.isArray(databaseMapping)) {
                // Handle array format (from UI)
                dbsToCheck = databaseMapping
                    .filter((m: any) => m.selected)
                    .map((m: any) => m.targetName || m.originalName);
            } else if (databaseMapping) {
                // Handle Record format
                dbsToCheck = Object.values(databaseMapping);
            } else if (targetDatabaseName) {
                dbsToCheck = [targetDatabaseName];
            }

            if (dbsToCheck.length > 0) {
                const dbConf = await resolveAdapterConfig(targetConfig) as any;
                if (privilegedAuth) dbConf.privilegedAuth = privilegedAuth;

                await targetAdapter.prepareRestore(dbConf, dbsToCheck);
            }
        }
    }

    // Version Compatibility Check
    const storageConfig = await prisma.adapterConfig.findUnique({ where: { id: storageConfigId } });
    if (storageConfig && targetConfig.type === 'database') {
        const storageAdapter = registry.get(storageConfig.adapterId) as StorageAdapter;
        const targetAdapter = registry.get(targetConfig.adapterId) as DatabaseAdapter;

        if (storageAdapter && storageAdapter.read && targetAdapter && targetAdapter.test) {
            try {
                const storageConf = await resolveAdapterConfig(storageConfig) as any;
                const metaPath = file + ".meta.json";
                const metadataContent = await storageAdapter.read(storageConf, metaPath);

                if (metadataContent) {
                    const metadata = JSON.parse(metadataContent) as BackupMetadata;

                    // STRICT TYPE CHECK: Prevent Cross-Vendor Restores (e.g. MySQL -> MariaDB)
                    if (metadata.sourceType && metadata.sourceType !== targetConfig.adapterId) {
                        throw new Error(`Incompatible database types: Cannot restore backup from '${metadata.sourceType}' to '${targetConfig.adapterId}'. Strict type matching is enforced to prevent corruption.`);
                    }

                    if (metadata.engineVersion) {
                        const dbConf = await resolveAdapterConfig(targetConfig) as any;
                        if (privilegedAuth) dbConf.privilegedAuth = privilegedAuth;

                        const testResult = await targetAdapter.test(dbConf) as { success: boolean; version?: string; edition?: string };
                        if (testResult.success && testResult.version) {
                            // Check if Source (Backup) > Target (Current Server)
                            if (compareVersions(metadata.engineVersion, testResult.version) > 0) {
                                throw new Error(`Running restore of a newer database version (${metadata.engineVersion}) on an older server (${testResult.version}) is not recommended. This can cause severe incompatibility issues.`);
                            }

                            // MSSQL Edition Compatibility Check: Azure SQL Edge <-> SQL Server
                            if (targetConfig.adapterId === 'mssql' && metadata.engineEdition && testResult.edition) {
                                const sourceIsEdge = metadata.engineEdition === 'Azure SQL Edge';
                                const targetIsEdge = testResult.edition === 'Azure SQL Edge';

                                if (sourceIsEdge !== targetIsEdge) {
                                    throw new Error(
                                        `Incompatible MSSQL editions: Cannot restore backup from '${metadata.engineEdition}' to '${testResult.edition}'. ` +
                                        `Azure SQL Edge and SQL Server are not fully compatible despite having similar version numbers.`
                                    );
                                }
                            }
                        }
                    }
                }
            } catch (e: unknown) {
                const errMsg = getErrorMessage(e);
                if (errMsg.includes('not recommended') || errMsg.includes('Incompatible') || errMsg.includes('Azure SQL Edge')) {
                    throw e;
                }
                // Ignore metadata read errors (e.g. file missing) or other non-critical issues
                svcLog.warn("Version check skipped", {}, wrapError(e));
            }
        }
    }
}
