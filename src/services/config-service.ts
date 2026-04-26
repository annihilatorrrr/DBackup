import prisma from "@/lib/prisma";
import { AppConfigurationBackup, RestoreOptions } from "@/lib/types/config-backup";
import { decryptConfig, encryptConfig, stripSecrets, decrypt, encrypt } from "@/lib/crypto";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import packageJson from "../../package.json";
import { registry } from "@/lib/core/registry";
import { registerAdapters } from "@/lib/adapters";
import { StorageAdapter } from "@/lib/core/interfaces";
import { createDecryptionStream } from "@/lib/crypto-stream";
import { createGunzip } from "zlib";
import { createReadStream, promises as fs } from "fs";
import { getTempDir } from "@/lib/temp-dir";
import path from "path";
import { Readable, Transform } from "stream";
import { getProfileMasterKey, getEncryptionProfiles } from "@/services/encryption-service";
import { pipeline } from "stream/promises";
import { logger } from "@/lib/logger";
import { wrapError } from "@/lib/errors";

const svcLog = logger.child({ service: "ConfigService" });

interface ExportOptions {
  includeSecrets: boolean;
  includeStatistics?: boolean;
}

export class ConfigService {
  /**
   * Generates the configuration object.
   * @param includeSecrets If true, decrypts DB passwords and includes them.
   * @param optionsOrIncludeSecrets Legacy boolean or options object.
   */
  async export(optionsOrIncludeSecrets: boolean | ExportOptions): Promise<AppConfigurationBackup> {
    const opts: ExportOptions = typeof optionsOrIncludeSecrets === 'boolean'
      ? { includeSecrets: optionsOrIncludeSecrets }
      : optionsOrIncludeSecrets;

    const { includeSecrets, includeStatistics = false } = opts;
    const settings = await prisma.systemSetting.findMany();
    const adapters = await prisma.adapterConfig.findMany();
    const jobs = await prisma.job.findMany();
    const jobDestinations = await prisma.jobDestination.findMany();
    const jobsWithNotifications = await prisma.job.findMany({
      select: { id: true, notifications: { select: { id: true } } }
    });
    const apiKeys = await prisma.apiKey.findMany();
    const users = await prisma.user.findMany({ include: { accounts: true } });
    const groups = await prisma.group.findMany();
    const ssoProviders = await prisma.ssoProvider.findMany();
    const encryptionProfiles = await prisma.encryptionProfile.findMany();

    // Build jobId → notificationIds map
    const jobNotifications: Record<string, string[]> = {};
    for (const j of jobsWithNotifications) {
      if (j.notifications.length > 0) {
        jobNotifications[j.id] = j.notifications.map(n => n.id);
      }
    }

    // Process Adapters
    const processedAdapters = adapters.map((adapter) => {
      let configObj: any = {};
      try {
        configObj = JSON.parse(adapter.config);
      } catch (e: unknown) {
        svcLog.warn("Failed to parse config for adapter", { adapterId: adapter.id }, wrapError(e));
      }

      // 1. Decrypt to get plaintext
      configObj = decryptConfig(configObj);

      // 2. If secrets not requested, strip them
      if (!includeSecrets) {
        configObj = stripSecrets(configObj);
      }

      return {
        ...adapter,
        config: JSON.stringify(configObj),
      };
    });

    // Process SSO Providers
    const processedSsoProviders = ssoProviders.map((provider) => {
      let clientSecret = provider.clientSecret;
      let oidcConfigStr = provider.oidcConfig;

      if (!includeSecrets) {
        // Strip secrets
        if (clientSecret) clientSecret = "";

        if (oidcConfigStr) {
          try {
            const oidcConfig = JSON.parse(oidcConfigStr);
            // Manually strip known secrets from OIDC config
            if (oidcConfig.clientSecret) oidcConfig.clientSecret = "";
            oidcConfigStr = JSON.stringify(oidcConfig);
          } catch {
             // Ignore parse error
          }
        }
      }

      return {
        ...provider,
        clientSecret,
        oidcConfig: oidcConfigStr,
      };
    });

    // Process Users (Strip secrets from accounts if needed)
    const processedUsers = users.map(user => {
         if (!includeSecrets) {
             const safeAccounts = user.accounts.map(acc => ({
                 ...acc,
                 password: null,
                 accessToken: null,
                 refreshToken: null,
                 idToken: null
             }));
             return { ...user, accounts: safeAccounts };
         }
         return user;
    });

    // Process Encryption Profiles
    const processedProfiles = await Promise.all(encryptionProfiles.map(async (p) => {
        if (includeSecrets) {
             // If secrets are requested, we assume the output transport is secure (e.g. Encrypted Backup).
             // We decrypt the system-encrypted key and export it as plaintext in the JSON.
             // This allows for full restore (including keys) on a new system.
             try {
                const plainKey = decrypt(p.secretKey);
                // Return it so it ends up in the JSON
                return { ...p, secretKey: plainKey };
             } catch (e: unknown) {
                 svcLog.error("Failed to decrypt profile key for export", { profileId: p.id }, wrapError(e));
                 // eslint-disable-next-line @typescript-eslint/no-unused-vars
                 const { secretKey, ...rest } = p;
                 return rest;
             }
        } else {
             // eslint-disable-next-line @typescript-eslint/no-unused-vars
             const { secretKey, ...rest } = p;
             return rest;
        }
    }));

    // Process API Keys (strip hashedKey when secrets not requested)
    const processedApiKeys = apiKeys.map(key => {
      if (!includeSecrets) {
        return { ...key, hashedKey: "" };
      }
      return key;
    });

    // Optional: Gather statistics data
    let statistics: AppConfigurationBackup['statistics'] | undefined;
    if (includeStatistics) {
      const [storageSnapshots, executions, auditLogs, notificationLogs] = await Promise.all([
        prisma.storageSnapshot.findMany(),
        prisma.execution.findMany(),
        prisma.auditLog.findMany(),
        prisma.notificationLog.findMany(),
      ]);
      statistics = { storageSnapshots, executions, auditLogs, notificationLogs };
    }

    return {
      metadata: {
        version: packageJson.version,
        exportedAt: new Date().toISOString(),
        includeSecrets,
        includeStatistics,
        sourceType: "SYSTEM",
      },
      settings,
      adapters: processedAdapters,
      jobs,
      jobDestinations,
      jobNotifications,
      apiKeys: processedApiKeys,
      users: processedUsers,
      groups,
      ssoProviders: processedSsoProviders,
      encryptionProfiles: processedProfiles,
      ...(statistics ? { statistics } : {}),
    };
  }

  /**
   * Parses a raw backup file (potentially encrypted/compressed) into the JSON object.
   * Helper for Offline Config Restore.
   */
  async parseBackupFile(filePath: string, metaFilePath?: string): Promise<AppConfigurationBackup> {
      let iv: Buffer | undefined;
      let authTag: Buffer | undefined;
      let profileId: string | undefined;
      let isCompressed = false;
      let isEncrypted = false;

      // 1. Try to read metadata if provided
      if (metaFilePath && await fs
          .stat(metaFilePath)
          .then(() => true)
          .catch(() => false)) {
          try {
              const metaContent = await fs.readFile(metaFilePath, 'utf-8');
              const meta = JSON.parse(metaContent);

              // 1. Detect Encryption Metadata (Standard vs Flat)
              if (meta.encryption && typeof meta.encryption === 'object' && meta.encryption.enabled) {
                  // Standard Nested Format
                  if (meta.encryption.iv) iv = Buffer.from(meta.encryption.iv, 'hex');
                  if (meta.encryption.authTag) authTag = Buffer.from(meta.encryption.authTag, 'hex');
                  if (meta.encryption.profileId) profileId = meta.encryption.profileId;
                  isEncrypted = true;
              } else {
                  // Legacy Flat Format
                  if (meta.iv) iv = Buffer.from(meta.iv, 'hex');
                  if (meta.authTag) authTag = Buffer.from(meta.authTag, 'hex');
                  profileId = meta.encryptionProfileId;
                  if (meta.encryption && meta.encryption !== 'NONE') isEncrypted = true;
              }

              if (meta.compression === 'GZIP') isCompressed = true;
          } catch (e: unknown) {
              svcLog.warn("Failed to parse metadata file", {}, wrapError(e));
          }
      } else {
          // Fallback: Guess by extension
          if (filePath.endsWith('.gz') || filePath.endsWith('.br')) isCompressed = await this.detectCompression(filePath);
      }

      // Auto-detect extension based fallback if meta failed/missing
       if (!isCompressed && filePath.endsWith('.gz')) isCompressed = true;
       if (!isEncrypted && filePath.endsWith('.enc')) isEncrypted = true;

      const streams: (Readable | Transform)[] = [createReadStream(filePath)];

      if (isEncrypted) {
          if (!iv || !authTag || !profileId) {
             throw new Error("Encrypted backup detected but metadata (IV/AuthTag/Profile) is missing. Please upload the .meta.json file as well.");
          }

           // Get Key
           const key = await getProfileMasterKey(profileId).catch(() => null);

           // Smart Recovery: If key not found (e.g. ID mismatch after new install), try finding ANY profile that works?
           // AES-GCM requires the key to init. If we pick wrong key, setAuthTag matches fine, until final() throws.
           // Implementing a loop here is tricky with streams (can't rewind easily).
           // Strategy: If lookup fails, fail. User works around by editing meta or ensuring profile matches.

           if (!key) {
               // Fallback: Try to find a profile with the same NAME?
               // ... (Skipping complex heuristics for now to keep it deterministic)
               throw new Error(`Encryption Profile ${profileId} not found. Please ensure the relevant Encryption Profile is restored first.`);
           }

           streams.push(createDecryptionStream(key, iv, authTag));
      }

      if (isCompressed) {
          streams.push(createGunzip());
      }

      // Collect stream to buffer
      let jsonString = '';
      const collector = new Transform({
          transform(chunk, encoding, callback) {
              jsonString += chunk.toString();
              callback();
          }
      });
      streams.push(collector);

      try {
        // @ts-expect-error Pipeline argument spread issues
        await pipeline(...streams);
        return JSON.parse(jsonString) as AppConfigurationBackup;
      } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          throw new Error(`Failed to process backup file: ${message}`);
      }
  }

  // Helper (Placeholder for real detection if needed, mostly extension is enough)
  private async detectCompression(file: string): Promise<boolean> {
      return file.endsWith('.gz');
  }

  /**
   * Restores configuration.
   * @param data The backup object
   * @param _strategy 'OVERWRITE' (Currently only strategy supported)
   * @param options Select which parts to restore
   */
  async import(data: AppConfigurationBackup, _strategy: 'OVERWRITE', options?: RestoreOptions): Promise<void> {
    if (!data.metadata || !data.metadata.version) {
      throw new Error("Invalid configuration backup: Missing metadata");
    }

    // Default options (Enable all if not specified)
    const opts = options || {
        settings: true,
        adapters: true,
        jobs: true,
        users: true,
        sso: true,
        profiles: true,
        statistics: false,
    };

    // TODO: Add version compatibility check here if needed in future
    svcLog.info("Restoring configuration", { version: data.metadata.version });

    await prisma.$transaction(async (tx) => {
      // 1. Restore Settings
      if (opts.settings) {
        for (const setting of data.settings) {
            await tx.systemSetting.upsert({
            where: { key: setting.key },
            create: setting,
            update: setting,
            });
        }
      }

      // 2. Restore Adapters
      // Build mapping from backup adapter ID → actual adapter ID for FK remapping
      const adapterIdMap = new Map<string, string>();
      if (opts.adapters) {
          for (const adapter of data.adapters) {
            let configObj: any = {};
            try {
            configObj = JSON.parse(adapter.config);
            } catch { /* empty */ }

            // Re-encrypt config with CURRENT system key
            configObj = encryptConfig(configObj);

            const adapterData = { ...adapter, config: JSON.stringify(configObj) };

            // Check if an adapter with the same name and type already exists
            const existingByName = await tx.adapterConfig.findFirst({
              where: { name: adapter.name, type: adapter.type },
            });
            if (existingByName && existingByName.id !== adapter.id) {
              // Update existing adapter in-place
              const { id: _id, ...updateFields } = adapterData;
              await tx.adapterConfig.update({
                where: { id: existingByName.id },
                data: updateFields,
              });
              adapterIdMap.set(adapter.id, existingByName.id);
            } else {
              await tx.adapterConfig.upsert({
                where: { id: adapter.id },
                create: adapterData,
                update: adapterData,
              });
            }
        }
      }

      // 3. Restore Encryption Profiles (Metadata only)
      // Build mapping from backup profile ID → actual profile ID for FK remapping
      const profileIdMap = new Map<string, string>();
      if (opts.profiles) {
        for (const profile of data.encryptionProfiles) {
            // Check if a profile with the same name but different ID exists
            const existingByName = await tx.encryptionProfile.findFirst({ where: { name: profile.name } });

            if (existingByName && existingByName.id !== profile.id) {
              // Update existing profile in-place
              await tx.encryptionProfile.update({
                where: { id: existingByName.id },
                data: {
                  name: profile.name,
                  description: profile.description,
                  updatedAt: new Date(),
                },
              });
              profileIdMap.set(profile.id, existingByName.id);
            } else {
              // Check if exists by ID
              const exists = await tx.encryptionProfile.findUnique({ where: { id: profile.id }});
              if (exists) {
                await tx.encryptionProfile.update({
                    where: { id: profile.id },
                    data: {
                        name: profile.name,
                        description: profile.description,
                        updatedAt: new Date(),
                    }
                });
              } else {
                // @ts-expect-error Types might miss secretKey depending on Omit usage
                if (profile.secretKey) {
                    // Re-encrypt with CURRENT system key
                    // @ts-expect-error Types might miss secretKey
                    const encryptedKey = encrypt(profile.secretKey);
                    await tx.encryptionProfile.create({
                        data: {
                            ...profile,
                            secretKey: encryptedKey
                        }
                    });
                } else {
                    svcLog.warn("Skipping encryption profile - secret key missing in export", { profileId: profile.id, name: profile.name });
                }
              }
            }
        }
      }

      // 4. Restore Jobs
      if (opts.jobs) {
        for (const jobItem of data.jobs) {
            const job = { ...jobItem };

            // Remap sourceId if the adapter was merged
            if (job.sourceId && adapterIdMap.has(job.sourceId)) {
              job.sourceId = adapterIdMap.get(job.sourceId)!;
            }

            // Remap encryptionProfileId if the profile was merged
            if (job.encryptionProfileId && profileIdMap.has(job.encryptionProfileId)) {
              job.encryptionProfileId = profileIdMap.get(job.encryptionProfileId)!;
            }

            // Check Encryption Profile Dependency
            if (job.encryptionProfileId) {
                const profileExists = await tx.encryptionProfile.findUnique({ where: { id: job.encryptionProfileId }});
                if (!profileExists) {
                    svcLog.warn("Removing invalid encryption profile from job", { encryptionProfileId: job.encryptionProfileId, jobName: job.name });
                    job.encryptionProfileId = null;
                }
            }

            // Check if a job with the same name but different ID exists
            const existingJob = await tx.job.findFirst({ where: { name: job.name } });
            if (existingJob && existingJob.id !== job.id) {
              const { id: _id, ...updateFields } = job;
              await tx.job.update({
                where: { id: existingJob.id },
                data: updateFields as any,
              });
            } else {
              await tx.job.upsert({
                where: { id: job.id },
                create: job as any,
                update: job as any,
              });
            }
        }

        // 4b. Restore Job Destinations
        if (data.jobDestinations && data.jobDestinations.length > 0) {
          for (const dest of data.jobDestinations) {
            const remapped = { ...dest };
            // Remap configId if the adapter was merged
            if (remapped.configId && adapterIdMap.has(remapped.configId)) {
              remapped.configId = adapterIdMap.get(remapped.configId)!;
            }
            await tx.jobDestination.upsert({
              where: { id: remapped.id },
              create: remapped,
              update: remapped,
            });
          }
        }

        // 4c. Restore Job Notification Assignments (M:M)
        if (data.jobNotifications) {
          for (const [jobId, notifIds] of Object.entries(data.jobNotifications)) {
            // Remap notification adapter IDs
            const remappedNotifIds = notifIds.map(id => adapterIdMap.get(id) ?? id);
            await tx.job.update({
              where: { id: jobId },
              data: {
                notifications: {
                  set: remappedNotifIds.map(id => ({ id }))
                }
              }
            });
          }
        }
      }

      // 5. Restore Groups
      // Build mappings from backup IDs → actual IDs for FK remapping
      const groupIdMap = new Map<string, string>();
      const userIdMap = new Map<string, string>();
      if (opts.users) {
        for (const group of data.groups) {
            // Check if a group with the same name but different ID already exists
            const existingByName = await tx.group.findUnique({ where: { name: group.name } });
            if (existingByName && existingByName.id !== group.id) {
              // Update the existing group in-place to avoid unique constraint violation
              await tx.group.update({
                where: { id: existingByName.id },
                data: { permissions: group.permissions, updatedAt: group.updatedAt },
              });
              groupIdMap.set(group.id, existingByName.id);
            } else {
              await tx.group.upsert({
                where: { id: group.id },
                create: group,
                update: group,
              });
            }
        }

        // 6. Restore Users
        for (const user of data.users) {
            const { accounts, ...userFields } = user;

            // Remap groupId if the group was merged into an existing one
            if (userFields.groupId && groupIdMap.has(userFields.groupId)) {
              userFields.groupId = groupIdMap.get(userFields.groupId)!;
            }

            // Check if a user with the same email but different ID already exists
            const existingUser = await tx.user.findUnique({ where: { email: user.email } });
            if (existingUser && existingUser.id !== user.id) {
              const { id: _id, email: _email, ...updateFields } = userFields;
              await tx.user.update({
                where: { id: existingUser.id },
                data: updateFields,
              });
              userIdMap.set(user.id, existingUser.id);
            } else {
              await tx.user.upsert({
                where: { id: user.id },
                create: userFields,
                update: userFields,
              });
            }

            // Determine the actual userId for child records
            const actualUserId = userIdMap.get(user.id) ?? user.id;

            if (accounts && Array.isArray(accounts)) {
                 for (const account of accounts) {
                     const remappedAccount = { ...account, userId: actualUserId };
                     await tx.account.upsert({
                         where: { id: account.id },
                         create: remappedAccount,
                         update: remappedAccount
                     });
                 }
            }
        }

        // 6b. Restore API Keys
        if (data.apiKeys && data.apiKeys.length > 0) {
          for (const key of data.apiKeys) {
            // Skip keys with stripped hashedKey (no-secret exports)
            if (!key.hashedKey) continue;
            const remappedKey = { ...key };
            if (remappedKey.userId && userIdMap.has(remappedKey.userId)) {
              remappedKey.userId = userIdMap.get(remappedKey.userId)!;
            }
            await tx.apiKey.upsert({
              where: { id: remappedKey.id },
              create: remappedKey,
              update: remappedKey,
            });
          }
        }
      }

      // 7. Restore SSO Providers
      if (opts.sso) {
        for (const provider of data.ssoProviders) {
            // Re-encrypt secrets with current system key before storing
            const providerData = { ...provider };
            if (providerData.clientId) {
              try { providerData.clientId = encrypt(providerData.clientId); } catch { /* already encrypted or empty */ }
            }
            if (providerData.clientSecret) {
              try { providerData.clientSecret = encrypt(providerData.clientSecret); } catch { /* already encrypted or empty */ }
            }
            if (providerData.oidcConfig) {
              try {
                const oidcConfig = JSON.parse(providerData.oidcConfig);
                if (oidcConfig.clientId) oidcConfig.clientId = encrypt(oidcConfig.clientId);
                if (oidcConfig.clientSecret) oidcConfig.clientSecret = encrypt(oidcConfig.clientSecret);
                providerData.oidcConfig = JSON.stringify(oidcConfig);
              } catch { /* parse error, keep as-is */ }
            }

            // Check if a provider with the same providerId but different ID exists
            const existingSso = await tx.ssoProvider.findUnique({ where: { providerId: providerData.providerId } });
            if (existingSso && existingSso.id !== providerData.id) {
              const { id: _id, ...ssoUpdateFields } = providerData;
              await tx.ssoProvider.update({
                where: { id: existingSso.id },
                data: ssoUpdateFields,
              });
            } else {
              await tx.ssoProvider.upsert({
                where: { id: providerData.id },
                create: providerData,
                update: providerData,
              });
            }
        }
      }

      // 8. Restore Statistics (optional)
      if (opts.statistics && data.statistics) {
        if (data.statistics.storageSnapshots) {
          for (const snapshot of data.statistics.storageSnapshots) {
            await tx.storageSnapshot.upsert({
              where: { id: snapshot.id },
              create: snapshot,
              update: snapshot,
            });
          }
        }
        if (data.statistics.executions) {
          for (const execution of data.statistics.executions) {
            const remapped = { ...execution };
            // Verify jobId FK exists, null out if not
            if (remapped.jobId) {
              const jobExists = await tx.job.findUnique({ where: { id: remapped.jobId }, select: { id: true } });
              if (!jobExists) remapped.jobId = null;
            }
            await tx.execution.upsert({
              where: { id: remapped.id },
              create: remapped as any,
              update: remapped as any,
            });
          }
        }
        if (data.statistics.auditLogs) {
          for (const auditLog of data.statistics.auditLogs) {
            const remapped = { ...auditLog };
            // Remap userId if the user was merged into an existing one
            if (remapped.userId && userIdMap.has(remapped.userId)) {
              remapped.userId = userIdMap.get(remapped.userId)!;
            }
            // Verify userId FK exists, null out if not (userId is nullable)
            if (remapped.userId) {
              const userExists = await tx.user.findUnique({ where: { id: remapped.userId }, select: { id: true } });
              if (!userExists) remapped.userId = null;
            }
            await tx.auditLog.upsert({
              where: { id: remapped.id },
              create: remapped,
              update: remapped,
            });
          }
        }
        if (data.statistics.notificationLogs) {
          for (const notifLog of data.statistics.notificationLogs) {
            await tx.notificationLog.upsert({
              where: { id: notifLog.id },
              create: notifLog,
              update: notifLog,
            });
          }
        }
      }
    });
  }


  /**
   * Orchestrates the restoration from a storage provider, including download, decryption, and decompression.
   * Runs as a background task via the Execution log.
   */
  async restoreFromStorage(
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
    this.runRestorePipeline(execution.id, storageConfigId, file, decryptionProfileId, options)
        .catch(err => svcLog.error("Restore pipeline logic error (uncaught)", {}, wrapError(err)));

    return execution.id;
  }

  private async runRestorePipeline(
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

                          const result = await this.tryDecryptFile(downloadPath, candidateKey, meta, isCompressed);
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
          await this.import(backupData, "OVERWRITE", options);

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

  /**
   * Attempts to decrypt (and decompress) a downloaded config backup file with a candidate key.
   * Returns the decrypted JSON string on success, or null on failure.
   */
  private async tryDecryptFile(
      downloadPath: string,
      candidateKey: Buffer,
      meta: any,
      isCompressed: boolean
  ): Promise<string | null> {
      const ivHex = meta?.encryption?.iv || meta?.iv;
      const authTagHex = meta?.encryption?.authTag || meta?.authTag;

      if (!ivHex || !authTagHex) return null;

      try {
          const iv = Buffer.from(ivHex, 'hex');
          const authTag = Buffer.from(authTagHex, 'hex');

          const streams: (Readable | Transform)[] = [createReadStream(downloadPath)];
          streams.push(createDecryptionStream(candidateKey, iv, authTag));
          if (isCompressed) streams.push(createGunzip());

          const chunks: Buffer[] = [];
          const collector = new Transform({
              transform(chunk, _encoding, callback) {
                  chunks.push(chunk);
                  callback();
              }
          });
          streams.push(collector);

          // @ts-expect-error Pipeline argument spread issues
          await pipeline(...streams);
          const content = Buffer.concat(chunks).toString('utf8').trim();

          // Validate: must be valid JSON
          if (content.startsWith('{') || content.startsWith('[')) {
              return content;
          }
          return null;
      } catch {
          return null;
      }
  }
}
