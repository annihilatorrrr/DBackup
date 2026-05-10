import { runJob, TriggerInfo } from "@/lib/runner";

export class BackupService {
    /**
     * Triggers a backup execution for a specific job.
     * Currently wraps the runner logic, but serves as the standard entry point.
     */
    async executeJob(jobId: string, triggerInfo?: TriggerInfo) {
        return runJob(jobId, triggerInfo);
    }
}

export const backupService = new BackupService();
