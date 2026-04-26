import prisma from "@/lib/prisma";
import { AppConfigurationBackup, RestoreOptions } from "@/lib/types/config-backup";
import { decrypt } from "@/lib/crypto";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import { registry } from "@/lib/core/registry";
import { registerAdapters } from "@/lib/adapters";
import { StorageAdapter } from "@/lib/core/interfaces";
import { createDecryptionStream } from "@/lib/crypto/stream";
import { createGunzip } from "zlib";
import { createReadStream, promises as fs } from "fs";
import { getTempDir } from "@/lib/temp-dir";
import path from "path";
import { Readable, Transform } from "stream";
import { getProfileMasterKey, getEncryptionProfiles } from "@/services/backup/encryption-service";
import { pipeline } from "stream/promises";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";
import { tryDecryptFile } from "./parse";
import { importConfiguration } from "./import";

const svcLog = logger.child({ service: "ConfigService" });

/**
 * Orchestrates the restoration from a storage provider, including download, decryption, and decompression.
 * Runs as a background task via the Execution log.
 * Returns the executionId for live progress tracking.
 */
export async function restoreFromStorage(
  storageConfigId: string,
  file: string,
  decryptionProfileId?: string,
  options?: RestoreOptions
): Promise<string> {

  // 1. Create Execution Record
  const execution = await prisma.execution.create({
    data: {
      type: "System Restore",
      status: "Running",
      startedAt: new Date(),
      logs: JSON.stringify([{
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Starting system configuration restore..."
      }]),
      metadata: JSON.stringify({ file, storageConfigId })
    }
  });

  // 2. Start Background Process
  runRestorePipeline(execution.id, storageConfigId, file, decryptionProfileId, options)
    .catch(err => svcLog.error("Restore pipeline logic error (uncaught)", {}, wrapError(err)));

  return execution.id;
}

async function runRestorePipeline(
  executionId: string,
  storageConfigId: string,
  filePath: string,
  decryptionProfileId?: string,
  options?: RestoreOptions
) {
  const logs: any[] = [];
  const pendingUpdates: Promise<any>[] = [];
  const log = (msg: string, level = "info") => {
    logs.push({ timestamp: new Date().toISOString(), level, message: msg });
    const p = prisma.execution.update({
      where: { id: executionId },
      data: { logs: JSON.stringify(logs) }
    }).catch(() => {});
    pendingUpdates.push(p);
  };

  // Wait for all pending fire-and-forget log writes to settle before final DB write
  const flushLogs = async () => {
    await Promise.allSettled(pendingUpdates);
    pendingUpdates.length = 0;
  };

  try {
    const tempDir = getTempDir();
    const downloadPath = path.join(tempDir, `restore-${executionId}-${path.basename(filePath)}`);

    log(`Initializing restore from ${filePath}`);

    // Ensure adapters are registered before accessing registry
    registerAdapters();

    // Fetch Storage Config
    const storageConfig = await prisma.adapterConfig.findUnique({ where: { id: storageConfigId } });
    if (!storageConfig) throw new Error("Storage adapter not found");

    const adapter = registry.get(storageConfig.adapterId) as StorageAdapter;
    if (!adapter) throw new Error(`Storage adapter '${storageConfig.adapterId}' not found in registry`);
    const config = await resolveAdapterConfig(storageConfig);

    // Download
    log("Downloading backup file...");
    await adapter.download(config, filePath, downloadPath);

    // Check Metadata if available (sidecar)
    let meta: any = null;
    try {
      if (adapter.read) {
        const metaContent = await adapter.read(config, filePath + ".meta.json");
        if (metaContent) meta = JSON.parse(metaContent);
      }
    } catch {
      log("Warning: Could not read metadata sidecar. Proceeding with filename detection.", "warn");
    }

    // Normalize Metadata for Logic
    const metaEncryption = meta?.encryption && typeof meta.encryption === 'object' ? meta.encryption : null;

    const isEncrypted = filePath.endsWith(".enc") ||
      (metaEncryption && metaEncryption.enabled) ||
      (meta && meta.iv);

    const isCompressed = filePath.includes(".gz") || (meta && String(meta.compression).toUpperCase() === 'GZIP');

    // ── Resolve Encryption Key ───────────────────────────────
    // Track if Smart Recovery already produced the decrypted content
    let smartRecoveryContent: string | null = null;

    let encryptionKey: Buffer | null = null;

    if (isEncrypted) {
      log("File detected as encrypted. Preparing decryption...");

      if (!decryptionProfileId) {
        if (metaEncryption?.profileId) {
          decryptionProfileId = metaEncryption.profileId;
        } else if (meta?.encryptionProfileId) {
          decryptionProfileId = meta.encryptionProfileId;
        }

        if (decryptionProfileId) {
          log(`Using Encryption Profile ID from metadata: ${decryptionProfileId}`);
        } else {
          throw new Error("File is encrypted but no Encryption Profile provided and metadata is missing encryptionProfileId.");
        }
      }

      try {
        const profile = await prisma.encryptionProfile.findUnique({ where: { id: decryptionProfileId } });
        if (!profile) throw new Error("Encryption profile not found");
        const decryptedKeyHex = decrypt(profile.secretKey);
        encryptionKey = Buffer.from(decryptedKeyHex, 'hex');
      } catch (_err) {
        log(`Profile ${decryptionProfileId} not found/accessible. Attempting Smart Recovery...`, "warn");

        // --- SMART RECOVERY LOGIC ---
        // Since config backups are small, decrypt the full file with each candidate key.
        // On success, keep the decrypted content to avoid re-processing the stream pipeline.
        const allProfiles = await getEncryptionProfiles();
        log(`Smart Recovery: Testing ${allProfiles.length} available profile(s)...`);

        for (const profile of allProfiles) {
          try {
            const candidateKey = await getProfileMasterKey(profile.id);
            log(`Smart Recovery: Testing profile '${profile.name}' (${profile.id})...`);

            const result = await tryDecryptFile(downloadPath, candidateKey, meta, isCompressed);
            if (result) {
              log(`Smart Recovery: Unlocked using profile '${profile.name}'`, "success");
              smartRecoveryContent = result;
              encryptionKey = candidateKey;
              break;
            }
          } catch {}
        }

        if (!smartRecoveryContent) {
          throw new Error("Encryption profile missing and no other key worked.");
        }
      }
    }

    // ── Process File ─────────────────────────────────────────
    let content: string;

    if (smartRecoveryContent) {
      // Smart Recovery already produced the decrypted+decompressed content
      log("Using pre-decrypted content from Smart Recovery.");
      content = smartRecoveryContent;
    } else {
      // Normal path: stream pipeline with proper error handling
      // Support both Flat (Old) and Nested (New) meta formats for IV/AuthTag
      let ivHex = meta?.iv;
      let authTagHex = meta?.authTag;
      if (meta?.encryption && typeof meta.encryption === 'object') {
        if (meta.encryption.iv) ivHex = meta.encryption.iv;
        if (meta.encryption.authTag) authTagHex = meta.encryption.authTag;
      }

      if (isEncrypted) {
        if (!ivHex || !authTagHex) {
          throw new Error("Missing encryption metadata (IV/AuthTag). Cannot decrypt.");
        }
        if (!encryptionKey) {
          throw new Error("No encryption key available.");
        }
      }

      // Use stream.pipeline() for proper error propagation across all streams
      const streams: (Readable | Transform)[] = [createReadStream(downloadPath)];

      if (isEncrypted && encryptionKey && ivHex && authTagHex) {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        streams.push(createDecryptionStream(encryptionKey, iv, authTag));
        log("Decryption stream attached.");
      }

      if (isCompressed) {
        log("File detected as compressed. Attaching gunzip...");
        streams.push(createGunzip());
      }

      log("Reading and parsing configuration data...");

      const chunks: Buffer[] = [];
      const collector = new Transform({
        transform(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      streams.push(collector);

      // pipeline() properly propagates errors across all streams
      // @ts-expect-error Pipeline argument spread issues
      await pipeline(...streams);
      content = Buffer.concat(chunks).toString("utf8");
    }

    // Parse
    let backupData: AppConfigurationBackup;
    try {
      backupData = JSON.parse(content);
    } catch {
      throw new Error("Failed to parse configuration JSON. File might be corrupt or decryption failed.");
    }

    // Validation
    if (!backupData.metadata || backupData.metadata.sourceType !== "SYSTEM") {
      log("Warning: Backup metadata does not explicitly state sourceType='SYSTEM'. Proceeding with caution...", "warn");
    }

    // Execute Import
    log("Applying configuration settings (Database Transaction)...");
    await importConfiguration(backupData, "OVERWRITE", options);

    log("Restoration completed successfully.", "info");

    await flushLogs();
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "Success",
        endedAt: new Date(),
        logs: JSON.stringify(logs)
      }
    });

    // Cleanup
    try {
      await fs.unlink(downloadPath);
    } catch {}

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Restoration failed: ${message}`, "error");
    await flushLogs();
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: "Failed",
        endedAt: new Date(),
        logs: JSON.stringify(logs)
      }
    });
  }
}
