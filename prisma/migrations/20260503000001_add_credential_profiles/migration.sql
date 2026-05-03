-- CreateTable
CREATE TABLE "CredentialProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable: Add credential profile references to AdapterConfig
ALTER TABLE "AdapterConfig" ADD COLUMN "primaryCredentialId" TEXT;
ALTER TABLE "AdapterConfig" ADD COLUMN "sshCredentialId" TEXT;
ALTER TABLE "AdapterConfig" ADD COLUMN "lastError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CredentialProfile_name_key" ON "CredentialProfile"("name");
