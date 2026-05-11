import type { TriggerInfo } from "@/lib/runner";

export interface RestoreInput {
    storageConfigId: string;
    file: string;
    targetSourceId: string;
    targetDatabaseName?: string;
    databaseMapping?: Record<string, string> | any[];
    privilegedAuth?: {
        user?: string;
        password?: string;
    };
    triggerInfo?: TriggerInfo;
}
