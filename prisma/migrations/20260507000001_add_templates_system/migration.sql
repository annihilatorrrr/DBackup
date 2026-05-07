-- CreateTable: RetentionPolicy
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: NamingTemplate
CREATE TABLE "NamingTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pattern" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: SchedulePreset
CREATE TABLE "SchedulePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable: Add FK to JobDestination
ALTER TABLE "JobDestination" ADD COLUMN "retentionPolicyId" TEXT;

-- AlterTable: Add FK to Job
ALTER TABLE "Job" ADD COLUMN "namingTemplateId" TEXT;
ALTER TABLE "Job" ADD COLUMN "schedulePresetId" TEXT;

-- AlterTable: Add FK to AdapterConfig (storage destinations)
ALTER TABLE "AdapterConfig" ADD COLUMN "defaultRetentionPolicyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_name_key" ON "RetentionPolicy"("name");
CREATE UNIQUE INDEX "NamingTemplate_name_key" ON "NamingTemplate"("name");
CREATE UNIQUE INDEX "SchedulePreset_name_key" ON "SchedulePreset"("name");

-- Seed: Built-in RetentionPolicy entries
INSERT INTO "RetentionPolicy" ("id", "name", "description", "config", "isDefault", "isSystem", "createdAt", "updatedAt")
VALUES
  ('retention-keep-all', 'Keep All', 'Never delete any backups automatically.', '{"mode":"NONE"}', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention-simple-14', 'Simple - 14 Days', 'Keep the last 14 backups.', '{"mode":"SIMPLE","simple":{"keepCount":14}}', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('retention-gvs-default', 'Smart GVS (7/4/12/2)', 'Grandfather-Father-Son: keep 7 daily, 4 weekly, 12 monthly, 2 yearly backups.', '{"mode":"SMART","smart":{"daily":7,"weekly":4,"monthly":12,"yearly":2}}', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed: Built-in NamingTemplate (system default)
INSERT INTO "NamingTemplate" ("id", "name", "description", "pattern", "isDefault", "isSystem", "createdAt", "updatedAt")
VALUES
  ('naming-standard', 'Standard', 'Default naming pattern: {name}_date_time', '{name}_yyyy-MM-dd_HH-mm-ss', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Seed: Built-in SchedulePresets
INSERT INTO "SchedulePreset" ("id", "name", "description", "schedule", "createdAt", "updatedAt")
VALUES
  ('schedule-daily-midnight', 'Daily at Midnight', 'Runs every day at 00:00.', '0 0 * * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('schedule-daily-3am', 'Daily at 3 AM', 'Runs every day at 03:00.', '0 3 * * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('schedule-weekly-sunday', 'Weekly on Sunday', 'Runs every Sunday at 02:00.', '0 2 * * 0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('schedule-hourly', 'Every Hour', 'Runs at the start of every hour.', '0 * * * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('schedule-monthly-1st', 'Monthly on 1st', 'Runs on the 1st of every month at 04:00.', '0 4 1 * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
