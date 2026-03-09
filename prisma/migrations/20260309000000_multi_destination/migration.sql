-- CreateTable: JobDestination (multi-destination fan-out)
CREATE TABLE "JobDestination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retention" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobDestination_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobDestination_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AdapterConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDestination_jobId_configId_key" ON "JobDestination" ("jobId", "configId");

-- DataMigration: Move existing Job.destinationId + Job.retention into JobDestination rows
INSERT INTO "JobDestination" ("id", "jobId", "configId", "priority", "retention", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
    "id",
    "destinationId",
    0,
    "retention",
    "createdAt",
    "updatedAt"
FROM "Job"
WHERE "destinationId" IS NOT NULL;

-- RedefineTables (SQLite doesn't support DROP COLUMN, so we recreate the table)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "sourceId" TEXT NOT NULL,
    "encryptionProfileId" TEXT,
    "compression" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "notificationEvents" TEXT NOT NULL DEFAULT 'ALWAYS',
    CONSTRAINT "Job_encryptionProfileId_fkey" FOREIGN KEY ("encryptionProfileId") REFERENCES "EncryptionProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AdapterConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Job" ("id", "name", "schedule", "enabled", "sourceId", "encryptionProfileId", "compression", "createdAt", "updatedAt", "notificationEvents")
SELECT "id", "name", "schedule", "enabled", "sourceId", "encryptionProfileId", "compression", "createdAt", "updatedAt", "notificationEvents"
FROM "Job";

DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";

PRAGMA foreign_keys=ON;

-- Drop old Destination relation table (implicit many-to-one was via FK, not join table)
-- The old relation "Destination" was a direct FK on Job.destinationId, which is now removed.
-- The _Notifications join table remains unchanged.
