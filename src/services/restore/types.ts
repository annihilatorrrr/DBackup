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
}
