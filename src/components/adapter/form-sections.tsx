import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormDescription,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Check, FolderOpen, Loader2 } from "lucide-react";
import { AdapterDefinition } from "@/lib/adapters/definitions";
import { SchemaField } from "./schema-field";
import { EmailTagField } from "./email-tag-field";
import { STORAGE_CONFIG_KEYS, STORAGE_CONNECTION_KEYS, NOTIFICATION_CONNECTION_KEYS, NOTIFICATION_CONFIG_KEYS } from "./form-constants";
import { GoogleDriveOAuthButton } from "./google-drive-oauth-button";
import { GoogleDriveFolderBrowser } from "./google-drive-folder-browser";
import { DropboxOAuthButton } from "./dropbox-oauth-button";
import { DropboxFolderBrowser } from "./dropbox-folder-browser";
import { OneDriveOAuthButton } from "./onedrive-oauth-button";
import { OneDriveFolderBrowser } from "./onedrive-folder-browser";
import { AdapterConfig } from "./types";

interface SectionProps {
    adapter: AdapterDefinition;
    detectedVersion?: string | null;
    healthNotificationsDisabled?: boolean;
    onHealthNotificationsDisabledChange?: (disabled: boolean) => void;
}

function HealthCheckNotificationSwitch({
    type,
    disabled,
    onChange,
}: {
    type: "database" | "storage";
    disabled: boolean;
    onChange: (disabled: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
                <Label htmlFor="health-notifications-disabled">Disable Health Check Notifications</Label>
                <p className="text-sm text-muted-foreground">
                    Suppress offline and recovery alerts for this {type === "database" ? "source" : "destination"}. Health checks still run.
                </p>
            </div>
            <Switch
                id="health-notifications-disabled"
                checked={disabled}
                onCheckedChange={onChange}
            />
        </div>
    );
}

export function DatabaseFormContent({
    adapter,
    detectedVersion,
    healthNotificationsDisabled,
    onHealthNotificationsDisabledChange,
}: SectionProps) {
    const { watch, getValues } = useFormContext();
    const mode = watch("config.mode");
    const authType = watch("config.authType");
    const [isTestingSqliteSsh, setIsTestingSqliteSsh] = useState(false);

    const testSqliteSshConnection = async () => {
        setIsTestingSqliteSsh(true);
        const toastId = toast.loading("Testing SSH connection...");
        try {
            const config = getValues("config");
            // Map SQLite field names to the generic SSH field names expected by the API
            const mappedConfig = {
                ...config,
                sshHost: config.host,
                sshPort: config.port,
                sshUsername: config.username,
                sshAuthType: config.authType,
                sshPassword: config.password,
                sshPrivateKey: config.privateKey,
                sshPassphrase: config.passphrase,
            };
            const res = await fetch("/api/adapters/test-ssh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config: mappedConfig }),
            });
            const result = await res.json();
            toast.dismiss(toastId);
            if (result.success) {
                toast.success(result.message || "SSH connection successful");
            } else {
                toast.error(result.message || "SSH connection failed");
            }
        } catch {
            toast.dismiss(toastId);
            toast.error("Failed to test SSH connection");
        } finally {
            setIsTestingSqliteSsh(false);
        }
    };

    if (adapter.id === "sqlite") {
        if (!mode) return null;

        return (
            <div className="space-y-4 pt-2">
                 {detectedVersion && (
                    <div className="flex justify-start mb-4">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="w-3 h-3 mr-1" />
                            Detected: {detectedVersion}
                        </Badge>
                    </div>
                 )}

                 {mode === 'local' ? (
                     <div className="space-y-4">
                         <div className="space-y-4 border p-4 rounded-md bg-muted/10">
                             <div className="space-y-4">
                                <FieldList keys={['path']} adapter={adapter} />
                                {/* sqliteBinaryPath hidden for local mode as requested */}
                             </div>
                         </div>
                         {onHealthNotificationsDisabledChange && (
                             <HealthCheckNotificationSwitch
                                 type="database"
                                 disabled={healthNotificationsDisabled ?? false}
                                 onChange={onHealthNotificationsDisabledChange}
                             />
                         )}
                     </div>
                 ) : (
                    <Tabs defaultValue="connection" className="w-full pt-2">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="connection">SSH Connection</TabsTrigger>
                            <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        </TabsList>

                        <TabsContent value="connection" className="space-y-4 pt-4 border p-4 rounded-md bg-muted/10 mt-2">
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-3">
                                    <FieldList keys={['host']} adapter={adapter} />
                                </div>
                                <div className="md:col-span-1">
                                    <FieldList keys={['port']} adapter={adapter} />
                                </div>
                            </div>

                            <FieldList keys={['username', 'authType']} adapter={adapter} />

                            {authType === 'password' && (
                                <FieldList keys={['password']} adapter={adapter} />
                            )}

                            {authType === 'privateKey' && (
                                 <FieldList keys={['privateKey', 'passphrase']} adapter={adapter} />
                            )}
                            <div className="flex justify-end pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={testSqliteSshConnection}
                                    disabled={isTestingSqliteSsh}
                                >
                                    {isTestingSqliteSsh && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Test SSH Connection
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="configuration" className="space-y-4 pt-4 mt-2">
                             <div className="space-y-4">
                                <FieldList keys={['path']} adapter={adapter} />
                                <FieldList keys={['sqliteBinaryPath']} adapter={adapter} />
                             </div>
                             {onHealthNotificationsDisabledChange && (
                                 <HealthCheckNotificationSwitch
                                     type="database"
                                     disabled={healthNotificationsDisabled ?? false}
                                     onChange={onHealthNotificationsDisabledChange}
                                 />
                             )}
                        </TabsContent>
                    </Tabs>
                 )}
            </div>
        );
    }

    const isMSSQL = adapter.id === "mssql";
    const fileTransferMode = watch("config.fileTransferMode");
    const sshAuthType = watch("config.sshAuthType");
    const connectionMode = watch("config.connectionMode");

    // Adapters that support SSH connection mode (have connectionMode field in schema)
    const hasSSH = adapter.configSchema.shape && "connectionMode" in adapter.configSchema.shape && !isMSSQL;

    // SSH-capable adapters: show mode selector first, then contextual tabs
    if (hasSSH) {
        const isSSH = connectionMode === "ssh";
        const defaultTab = isSSH ? "ssh" : "connection";

        // Before mode is selected, show nothing (selector is in the parent form)
        if (!connectionMode) {
            return null;
        }

        return (
            <SshAwareTabLayout
                key={connectionMode}
                isSSH={isSSH}
                defaultTab={defaultTab}
                adapter={adapter}
                sshAuthType={sshAuthType}
                detectedVersion={detectedVersion}
                healthNotificationsDisabled={healthNotificationsDisabled}
                onHealthNotificationsDisabledChange={onHealthNotificationsDisabledChange}
            />
        );
    }

    // MSSQL and adapters without SSH support
    const tabCount = 2 + (isMSSQL ? 1 : 0);

    return (
        <Tabs defaultValue="connection" className="w-full">
            <TabsList className={cn("grid w-full",
                tabCount === 2 && "grid-cols-2",
                tabCount === 3 && "grid-cols-3",
            )}>
                <TabsTrigger value="connection">Connection</TabsTrigger>
                <TabsTrigger value="configuration">Configuration</TabsTrigger>
                {isMSSQL && <TabsTrigger value="filetransfer">File Transfer</TabsTrigger>}
            </TabsList>

            <TabsContent value="connection" className="space-y-4 pt-4">
                {detectedVersion && (
                    <div className="mb-4">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="w-3 h-3 mr-1" />
                            Detected: {detectedVersion}
                        </Badge>
                    </div>
                )}
                <FieldList
                    keys={['uri', 'host', 'port', 'user', 'username', 'password']}
                    adapter={adapter}
                />
            </TabsContent>

            <TabsContent value="configuration" className="space-y-4 pt-4">
                {detectedVersion && (
                    <div className="mb-4">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="w-3 h-3 mr-1" />
                            Detected: {detectedVersion}
                        </Badge>
                    </div>
                )}
                {adapter.id === 'redis' && (
                    <RedisDatabaseSelect />
                )}
                <FieldList
                    keys={[
                        'authenticationDatabase', 'options', 'disableSsl',
                        // MSSQL-specific
                        'encrypt', 'trustServerCertificate', 'requestTimeout',
                        // Redis-specific (database is handled by RedisDatabaseSelect above)
                        'mode', 'tls', 'sentinelMasterName', 'sentinelNodes',
                    ]}
                    adapter={adapter}
                />
                {onHealthNotificationsDisabledChange && (
                    <HealthCheckNotificationSwitch
                        type="database"
                        disabled={healthNotificationsDisabled ?? false}
                        onChange={onHealthNotificationsDisabledChange}
                    />
                )}
            </TabsContent>

            {isMSSQL && (
                <TabsContent value="filetransfer" className="space-y-4 pt-4">
                    <FieldList keys={['backupPath', 'fileTransferMode']} adapter={adapter} />

                    {fileTransferMode === "ssh" && (
                        <SshConfigSection adapter={adapter} sshAuthType={sshAuthType} />
                    )}
                    {fileTransferMode === "local" && (
                        <div className="space-y-4">
                            <FieldList keys={['localBackupPath']} adapter={adapter} />
                            <p className="text-sm text-muted-foreground">
                                The local path must point to the same directory as the server backup path (e.g. Docker volume mount or NFS share).
                            </p>
                        </div>
                    )}
                </TabsContent>
            )}
        </Tabs>
    );
}

/**
 * Tab layout for SSH-capable adapters. Uses key={connectionMode} to force remount on mode change,
 * ensuring the active tab resets to the first tab.
 */
function SshAwareTabLayout({
    isSSH,
    defaultTab,
    adapter,
    sshAuthType,
    detectedVersion,
    healthNotificationsDisabled,
    onHealthNotificationsDisabledChange,
}: {
    isSSH: boolean;
    defaultTab: string;
    adapter: AdapterDefinition;
    sshAuthType: string;
    detectedVersion?: string | null;
    healthNotificationsDisabled?: boolean;
    onHealthNotificationsDisabledChange?: (disabled: boolean) => void;
}) {
    return (
        <div className="space-y-4 pt-2">
            {detectedVersion && (
                <div className="flex justify-start">
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="w-3 h-3 mr-1" />
                        Detected: {detectedVersion}
                    </Badge>
                </div>
            )}

            {isSSH ? (
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="ssh">SSH Connection</TabsTrigger>
                        <TabsTrigger value="connection">Database</TabsTrigger>
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ssh" className="space-y-4 pt-4">
                        <SshConfigSection adapter={adapter} sshAuthType={sshAuthType} description="SSH credentials to execute database commands on the remote server." />
                    </TabsContent>

                    <TabsContent value="connection" className="space-y-4 pt-4">
                        <p className="text-sm text-muted-foreground">
                            Database connection as seen from the SSH host (e.g. 127.0.0.1 if the database runs on the same server).
                        </p>
                        <FieldList
                            keys={['uri', 'host', 'port', 'user', 'username', 'password']}
                            adapter={adapter}
                        />
                    </TabsContent>

                    <TabsContent value="configuration" className="space-y-4 pt-4">
                        {adapter.id === 'redis' && <RedisDatabaseSelect />}
                        <FieldList
                            keys={[
                                'authenticationDatabase', 'options', 'disableSsl',
                                'mode', 'tls', 'sentinelMasterName', 'sentinelNodes',
                            ]}
                            adapter={adapter}
                        />
                        {onHealthNotificationsDisabledChange && (
                            <HealthCheckNotificationSwitch
                                type="database"
                                disabled={healthNotificationsDisabled ?? false}
                                onChange={onHealthNotificationsDisabledChange}
                            />
                        )}
                    </TabsContent>
                </Tabs>
            ) : (
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="connection">Connection</TabsTrigger>
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                    </TabsList>

                    <TabsContent value="connection" className="space-y-4 pt-4">
                        <FieldList
                            keys={['uri', 'host', 'port', 'user', 'username', 'password']}
                            adapter={adapter}
                        />
                    </TabsContent>

                    <TabsContent value="configuration" className="space-y-4 pt-4">
                        {adapter.id === 'redis' && <RedisDatabaseSelect />}
                        <FieldList
                            keys={[
                                'authenticationDatabase', 'options', 'disableSsl',
                                'mode', 'tls', 'sentinelMasterName', 'sentinelNodes',
                            ]}
                            adapter={adapter}
                        />
                        {onHealthNotificationsDisabledChange && (
                            <HealthCheckNotificationSwitch
                                type="database"
                                disabled={healthNotificationsDisabled ?? false}
                                onChange={onHealthNotificationsDisabledChange}
                            />
                        )}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

/**
 * SSH configuration section with integrated test button.
 * Used by MSSQL (file transfer) and other database adapters (SSH exec).
 */
function SshConfigSection({ adapter, sshAuthType, description }: { adapter: AdapterDefinition; sshAuthType: string; description?: string }) {
    const { getValues } = useFormContext();
    const [isTestingSsh, setIsTestingSsh] = useState(false);

    const testSshConnection = async () => {
        setIsTestingSsh(true);
        const toastId = toast.loading("Testing SSH connection...");
        try {
            const config = getValues("config");
            const res = await fetch("/api/adapters/test-ssh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config }),
            });
            const result = await res.json();
            toast.dismiss(toastId);

            if (result.success) {
                toast.success(result.message || "SSH connection successful");
            } else {
                toast.error(result.message || "SSH connection failed");
            }
        } catch {
            toast.dismiss(toastId);
            toast.error("Failed to test SSH connection");
        } finally {
            setIsTestingSsh(false);
        }
    };

    return (
        <div className="space-y-4 border p-4 rounded-md bg-muted/10">
            <p className="text-sm text-muted-foreground">
                {description || "SSH credentials to download/upload .bak files from the SQL Server host."}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3">
                    <FieldList keys={['sshHost']} adapter={adapter} />
                </div>
                <div className="md:col-span-1">
                    <FieldList keys={['sshPort']} adapter={adapter} />
                </div>
            </div>
            <FieldList keys={['sshUsername', 'sshAuthType']} adapter={adapter} />
            {sshAuthType === 'password' && (
                <FieldList keys={['sshPassword']} adapter={adapter} />
            )}
            {sshAuthType === 'privateKey' && (
                <FieldList keys={['sshPrivateKey', 'sshPassphrase']} adapter={adapter} />
            )}
            <div className="flex justify-end pt-2">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={testSshConnection}
                    disabled={isTestingSsh}
                >
                    {isTestingSsh && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Test SSH Connection
                </Button>
            </div>
        </div>
    );
}

export function StorageFormContent({
    adapter,
    initialData,
    healthNotificationsDisabled,
    onHealthNotificationsDisabledChange,
}: { adapter: AdapterDefinition; initialData?: AdapterConfig; healthNotificationsDisabled?: boolean; onHealthNotificationsDisabledChange?: (disabled: boolean) => void }) {
    const { watch } = useFormContext();
    const authType = watch("config.authType");
    const hasRealConfigKeys = hasFields(adapter, STORAGE_CONFIG_KEYS);
    // Always show Configuration tab for storage adapters (health check switch lives there)
    const hasConfigKeys = hasRealConfigKeys || !!onHealthNotificationsDisabledChange;
    const isGoogleDrive = adapter.id === 'google-drive';
    const isDropbox = adapter.id === 'dropbox';
    const isOneDrive = adapter.id === 'onedrive';
    const isOAuthAdapter = isGoogleDrive || isDropbox || isOneDrive;

    // For OAuth adapters: filter out refreshToken from connection keys (auto-managed via OAuth)
    const connectionKeys = isOAuthAdapter
        ? STORAGE_CONNECTION_KEYS.filter(k => k !== 'refreshToken')
        : STORAGE_CONNECTION_KEYS;

    // For OAuth adapters: filter out refreshToken from config keys too
    const configKeys = isOAuthAdapter
        ? STORAGE_CONFIG_KEYS.filter(k => k !== 'refreshToken')
        : STORAGE_CONFIG_KEYS;

    // Check if the config has a refresh token (for existing/authorized adapters)
    const hasRefreshToken = initialData ? (() => {
        try {
            const config = JSON.parse(initialData.config);
            return !!config.refreshToken;
        } catch {
            return false;
        }
    })() : false;

    // Watch full config for Google Drive folder browser
    const config = watch("config");

    return (
        <Tabs defaultValue="connection" className="w-full">
            <TabsList className={cn("grid w-full", hasConfigKeys ? "grid-cols-2" : "grid-cols-1")}>
                <TabsTrigger value="connection">Connection</TabsTrigger>
                {hasConfigKeys && (
                    <TabsTrigger value="configuration">Configuration</TabsTrigger>
                )}
            </TabsList>

            <TabsContent value="connection" className="space-y-4 pt-4">
                {(adapter.id === 'sftp' || adapter.id === 'rsync') ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-3">
                                <FieldList keys={['host']} adapter={adapter} />
                            </div>
                            <div className="md:col-span-1">
                                <FieldList keys={['port']} adapter={adapter} />
                            </div>
                        </div>

                        <FieldList keys={['username', 'authType']} adapter={adapter} />

                        {(!authType || authType === 'password') && (
                             <FieldList keys={['password']} adapter={adapter} />
                        )}

                        {authType === 'privateKey' && (
                             <FieldList keys={['privateKey', 'passphrase']} adapter={adapter} />
                        )}
                    </div>
                ) : isGoogleDrive ? (
                    <div className="space-y-4">
                        <FieldList keys={['clientId', 'clientSecret']} adapter={adapter} />
                        <GoogleDriveOAuthButton
                            adapterId={initialData?.id}
                            hasRefreshToken={hasRefreshToken}
                        />
                    </div>
                ) : isDropbox ? (
                    <div className="space-y-4">
                        <FieldList keys={['clientId', 'clientSecret']} adapter={adapter} />
                        <DropboxOAuthButton
                            adapterId={initialData?.id}
                            hasRefreshToken={hasRefreshToken}
                        />
                    </div>
                ) : isOneDrive ? (
                    <div className="space-y-4">
                        <FieldList keys={['clientId', 'clientSecret']} adapter={adapter} />
                        <OneDriveOAuthButton
                            adapterId={initialData?.id}
                            hasRefreshToken={hasRefreshToken}
                        />
                    </div>
                ) : (
                    <FieldList keys={connectionKeys} adapter={adapter} />
                )}
            </TabsContent>

            {hasConfigKeys && (
                <TabsContent value="configuration" className="space-y-4 pt-4">
                    {isGoogleDrive ? (
                        <GoogleDriveFolderField
                            adapter={adapter}
                            config={config}
                            hasRefreshToken={hasRefreshToken}
                        />
                    ) : isDropbox ? (
                        <DropboxFolderField
                            adapter={adapter}
                            config={config}
                            hasRefreshToken={hasRefreshToken}
                        />
                    ) : isOneDrive ? (
                        <OneDriveFolderField
                            adapter={adapter}
                            config={config}
                            hasRefreshToken={hasRefreshToken}
                        />
                    ) : hasRealConfigKeys ? (
                        <FieldList keys={configKeys} adapter={adapter} />
                    ) : null}
                    {onHealthNotificationsDisabledChange && (
                        <HealthCheckNotificationSwitch
                            type="storage"
                            disabled={healthNotificationsDisabled ?? false}
                            onChange={onHealthNotificationsDisabledChange}
                        />
                    )}
                </TabsContent>
            )}
        </Tabs>
    );
}

export function NotificationFormContent({ adapter }: { adapter: AdapterDefinition }) {
    const hasConfigKeys = hasFields(adapter, NOTIFICATION_CONFIG_KEYS);
    const isEmail = adapter.id === "email";
    // Filter out 'to' from config keys for email — rendered separately as TagInput
    const configKeys = isEmail
        ? NOTIFICATION_CONFIG_KEYS.filter((k) => k !== "to")
        : NOTIFICATION_CONFIG_KEYS;

    return (
        <Tabs defaultValue="connection" className="w-full">
            <TabsList className={cn("grid w-full", hasConfigKeys ? "grid-cols-2" : "grid-cols-1")}>
                <TabsTrigger value="connection">Connection</TabsTrigger>
                {hasConfigKeys && (
                    <TabsTrigger value="configuration">Configuration</TabsTrigger>
                )}
            </TabsList>

            <TabsContent value="connection" className="space-y-4 pt-4">
                <FieldList keys={NOTIFICATION_CONNECTION_KEYS} adapter={adapter} />
            </TabsContent>

            {hasConfigKeys && (
                <TabsContent value="configuration" className="space-y-4 pt-4">
                    <FieldList keys={configKeys} adapter={adapter} />
                    {isEmail && <EmailTagField />}
                </TabsContent>
            )}
        </Tabs>
    );
}

export function GenericFormContent({ adapter, detectedVersion }: { adapter: AdapterDefinition, detectedVersion?: string | null }) {
    return (
        <div className="space-y-4 border p-4 rounded-md bg-muted/30">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Configuration</h4>
                {detectedVersion && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="w-3 h-3 mr-1" />
                        Detected: {detectedVersion}
                    </Badge>
                )}
            </div>
            <FieldList keys={Object.keys((adapter.configSchema as any).shape)} adapter={adapter} />
        </div>
    );
}

// --- Helpers ---

/**
 * Google Drive folder picker field with browse button.
 * Shows a text input for folderId + a browse button that opens the folder browser.
 */
function GoogleDriveFolderField({
    adapter: _adapter,
    config,
    hasRefreshToken,
}: {
    adapter: AdapterDefinition;
    config: Record<string, unknown>;
    hasRefreshToken: boolean;
}) {
    const { setValue, watch } = useFormContext();
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const folderId = watch("config.folderId") || "";
    const [folderName, setFolderName] = useState<string | null>(null);

    // Get refresh token from current form values (might be encrypted in DB but decrypted in form)
    const refreshToken = config?.refreshToken as string | undefined;
    const canBrowse = hasRefreshToken && !!refreshToken && !!config?.clientId && !!config?.clientSecret;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Folder ID</Label>
                <div className="flex gap-2">
                    <Input
                        value={folderId}
                        onChange={(e) => setValue("config.folderId", e.target.value)}
                        placeholder="Leave empty for root (My Drive)"
                        className="font-mono text-sm"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsBrowserOpen(true)}
                        disabled={!canBrowse}
                        title={canBrowse ? "Browse Google Drive folders" : "Authorize Google Drive first to browse folders"}
                    >
                        <FolderOpen className="h-4 w-4" />
                    </Button>
                </div>
                {folderName && folderId && (
                    <p className="text-xs text-muted-foreground">
                        Selected folder: <span className="font-medium">{folderName}</span>
                    </p>
                )}
                {!canBrowse && (
                    <p className="text-xs text-muted-foreground">
                        Authorize Google Drive first to use the folder browser.
                    </p>
                )}
            </div>

            {canBrowse && (
                <GoogleDriveFolderBrowser
                    open={isBrowserOpen}
                    onOpenChange={setIsBrowserOpen}
                    onSelect={(selectedId, selectedName) => {
                        setValue("config.folderId", selectedId);
                        setFolderName(selectedName);
                    }}
                    config={{
                        clientId: config.clientId as string,
                        clientSecret: config.clientSecret as string,
                        refreshToken: refreshToken!,
                    }}
                    initialFolderId={folderId || undefined}
                />
            )}
        </div>
    );
}

/**
 * Dropbox folder picker field with browse button.
 * Shows a text input for folderPath + a browse button that opens the folder browser.
 */
function DropboxFolderField({
    adapter: _adapter,
    config,
    hasRefreshToken,
}: {
    adapter: AdapterDefinition;
    config: Record<string, unknown>;
    hasRefreshToken: boolean;
}) {
    const { setValue, watch } = useFormContext();
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const folderPath = watch("config.folderPath") || "";

    const refreshToken = config?.refreshToken as string | undefined;
    const canBrowse = hasRefreshToken && !!refreshToken && !!config?.clientId && !!config?.clientSecret;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Folder Path</Label>
                <div className="flex gap-2">
                    <Input
                        value={folderPath}
                        onChange={(e) => setValue("config.folderPath", e.target.value)}
                        placeholder="Leave empty for root (e.g. /backups)"
                        className="font-mono text-sm"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsBrowserOpen(true)}
                        disabled={!canBrowse}
                        title={canBrowse ? "Browse Dropbox folders" : "Authorize Dropbox first to browse folders"}
                    >
                        <FolderOpen className="h-4 w-4" />
                    </Button>
                </div>
                {!canBrowse && (
                    <p className="text-xs text-muted-foreground">
                        Authorize Dropbox first to use the folder browser.
                    </p>
                )}
            </div>

            {canBrowse && (
                <DropboxFolderBrowser
                    open={isBrowserOpen}
                    onOpenChange={setIsBrowserOpen}
                    onSelect={(selectedPath) => {
                        setValue("config.folderPath", selectedPath);
                    }}
                    config={{
                        clientId: config.clientId as string,
                        clientSecret: config.clientSecret as string,
                        refreshToken: refreshToken!,
                    }}
                    initialPath={folderPath || undefined}
                />
            )}
        </div>
    );
}

/**
 * OneDrive folder picker field with browse button.
 * Shows a text input for folderPath + a browse button that opens the folder browser.
 */
function OneDriveFolderField({
    adapter: _adapter,
    config,
    hasRefreshToken,
}: {
    adapter: AdapterDefinition;
    config: Record<string, unknown>;
    hasRefreshToken: boolean;
}) {
    const { setValue, watch } = useFormContext();
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const folderPath = watch("config.folderPath") || "";

    const refreshToken = config?.refreshToken as string | undefined;
    const canBrowse = hasRefreshToken && !!refreshToken && !!config?.clientId && !!config?.clientSecret;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Folder Path</Label>
                <div className="flex gap-2">
                    <Input
                        value={folderPath}
                        onChange={(e) => setValue("config.folderPath", e.target.value)}
                        placeholder="Leave empty for root (e.g. /backups)"
                        className="font-mono text-sm"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsBrowserOpen(true)}
                        disabled={!canBrowse}
                        title={canBrowse ? "Browse OneDrive folders" : "Authorize OneDrive first to browse folders"}
                    >
                        <FolderOpen className="h-4 w-4" />
                    </Button>
                </div>
                {!canBrowse && (
                    <p className="text-xs text-muted-foreground">
                        Authorize OneDrive first to use the folder browser.
                    </p>
                )}
            </div>

            {canBrowse && (
                <OneDriveFolderBrowser
                    open={isBrowserOpen}
                    onOpenChange={setIsBrowserOpen}
                    onSelect={(selectedPath) => {
                        setValue("config.folderPath", selectedPath);
                    }}
                    config={{
                        clientId: config.clientId as string,
                        clientSecret: config.clientSecret as string,
                        refreshToken: refreshToken!,
                    }}
                    initialPath={folderPath || undefined}
                />
            )}
        </div>
    );
}

function FieldList({
    keys,
    adapter,
    isDatabase = false,
    availableDatabases = [],
    isLoadingDbs = false,
    onLoadDbs,
    isDbListOpen,
    setIsDbListOpen
}: {
    keys: string[];
    adapter: AdapterDefinition;
    isDatabase?: boolean;
    availableDatabases?: string[];
    isLoadingDbs?: boolean;
    onLoadDbs?: () => void;
    isDbListOpen?: boolean;
    setIsDbListOpen?: (open: boolean) => void;
}) {
    return (
        <>
            {keys.map((key) => {
                if (!((adapter.configSchema as any).shape[key])) return null;
                const shape = (adapter.configSchema as any).shape[key];

                return (
                    <SchemaField
                        key={key}
                        name={`config.${key}`}
                        fieldKey={key}
                        schemaShape={shape}
                        adapterId={adapter.id}
                        isDatabaseField={key === 'database' && isDatabase}
                        availableDatabases={availableDatabases}
                        isLoadingDbs={isLoadingDbs}
                        onLoadDbs={onLoadDbs}
                        isDbListOpen={isDbListOpen}
                        setIsDbListOpen={setIsDbListOpen}
                    />
                );
            })}
        </>
    );
}

function hasFields(adapter: AdapterDefinition, keys: string[]) {
    const shape = (adapter.configSchema as any).shape;
    return keys.some(key => key in shape);
}

/** Redis-specific database index selector (0–15) with info text */
function RedisDatabaseSelect() {
    const { control, setValue, getValues } = useFormContext();
    const dbOptions = Array.from({ length: 16 }, (_, i) => i);

    // Ensure default value is set in the form (field may be undefined for new adapters)
    const current = getValues("config.database");
    if (current === undefined || current === null || current === "") {
        setValue("config.database", 0);
    }

    return (
        <FormField
            control={control}
            name="config.database"
            render={({ field }) => {
                const numVal = Number(field.value ?? 0);
                return (
                    <FormItem>
                        <FormLabel>Database</FormLabel>
                        <FormControl>
                            <Select
                                value={`db-${numVal}`}
                                onValueChange={(val) => field.onChange(Number(val.replace("db-", "")))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {dbOptions.map((db) => (
                                        <SelectItem key={db} value={`db-${db}`}>
                                            {db === 0 ? "Default (0)" : db}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormControl>
                        <FormDescription>
                            Redis RDB backups always include all databases (0–15). This selects the default database for the connection.
                        </FormDescription>
                    </FormItem>
                );
            }}
        />
    );
}
