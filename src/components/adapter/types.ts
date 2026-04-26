
export interface AdapterConfig {
    id: string;
    name: string;
    adapterId: string;
    type: string;
    config: string; // JSON string
    metadata?: string; // JSON string
    createdAt: string;
    primaryCredentialId?: string | null;
    sshCredentialId?: string | null;
    lastStatus?: string | null;
    lastError?: string | null;
}

export interface AdapterManagerProps {
    type: 'database' | 'storage' | 'notification';
    title: string;
    description: string;
    canManage?: boolean;
    permissions?: string[];
}
