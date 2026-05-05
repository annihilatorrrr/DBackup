import { AdapterConfig, Job, JobDestination, SystemSetting, User, Group, SsoProvider, EncryptionProfile, CredentialProfile, Account, ApiKey, StorageSnapshot, Execution, AuditLog, NotificationLog } from "@prisma/client";

export interface AppConfigurationBackup {
  metadata: {
    version: string;      // App Version (e.g. from package.json)
    exportedAt: string;   // ISO Date
    includeSecrets: boolean;
    includeStatistics?: boolean;
    sourceType: 'SYSTEM' | 'MANUAL';
  };
  settings: SystemSetting[];
  credentialProfiles: (Omit<CredentialProfile, 'data'> & { data: string })[];
  adapters: AdapterConfig[];
  jobs: Job[];
  jobDestinations: JobDestination[];
  // Maps jobId → array of notification AdapterConfig IDs (implicit M:M _Notifications table)
  jobNotifications: Record<string, string[]>;
  apiKeys: ApiKey[];
  users: (User & { accounts: Account[] })[];
  groups: Group[];
  ssoProviders: SsoProvider[];
  encryptionProfiles: Omit<EncryptionProfile, 'secretKey'>[];

  // Optional statistics data
  statistics?: {
    storageSnapshots?: StorageSnapshot[];
    executions?: Execution[];
    auditLogs?: AuditLog[];
    notificationLogs?: NotificationLog[];
  };
}

export interface RestoreOptions {
    settings: boolean;
    adapters: boolean;
    jobs: boolean;     // Includes JobDestinations and notification assignments
    users: boolean;    // Includes Users, Groups, and API Keys
    sso: boolean;
    profiles: boolean;
    statistics?: boolean;
}
