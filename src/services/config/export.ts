import prisma from "@/lib/prisma";
import { AppConfigurationBackup } from "@/lib/types/config-backup";
import { decryptConfig, stripSecrets, decrypt } from "@/lib/crypto";
import packageJson from "../../../package.json";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";

const svcLog = logger.child({ service: "ConfigService" });

export interface ExportOptions {
  includeSecrets: boolean;
  includeStatistics?: boolean;
}

/**
 * Generates the configuration backup object from current DB state.
 */
export async function exportConfiguration(
  optionsOrIncludeSecrets: boolean | ExportOptions
): Promise<AppConfigurationBackup> {
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
