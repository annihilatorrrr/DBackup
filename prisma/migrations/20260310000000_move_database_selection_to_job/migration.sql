-- AlterTable: Add databases column to Job table
-- Stores a JSON array of database names to back up (e.g. ["db1","db2"])
-- Empty array [] means "back up all" (or fall back to source config)
ALTER TABLE "Job" ADD COLUMN "databases" TEXT NOT NULL DEFAULT '[]';
