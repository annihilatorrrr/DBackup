import { Client, ConnectConfig } from "ssh2";
import { normalizeSshPrivateKey } from "./pkcs8-compat";

/**
 * Generic SSH connection configuration used across all adapters.
 */
export interface SshConnectionConfig {
    host: string;
    port?: number;
    username: string;
    authType: "password" | "privateKey" | "agent";
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

/**
 * Generic SSH client for remote command execution over SSH2.
 * Extracted from the SQLite adapter for shared use across all database adapters.
 */
export class SshClient {
    private client: Client;

    constructor() {
        this.client = new Client();
    }

    public connect(config: SshConnectionConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const sshConfig: ConnectConfig = {
                host: config.host,
                port: config.port ?? 22,
                username: config.username,
                readyTimeout: 20000,
                keepaliveInterval: 10000,
                keepaliveCountMax: 3,
            };

            if (config.authType === "privateKey") {
                // PKCS#8 encrypted keys (BEGIN ENCRYPTED PRIVATE KEY) are not
                // supported by ssh2. Decrypt them in-memory via Node.js crypto
                // so they work transparently without any manual conversion.
                if (config.privateKey?.includes("BEGIN ENCRYPTED PRIVATE KEY")) {
                    if (!config.passphrase) {
                        reject(new Error("This private key is passphrase-protected. Please provide the passphrase."));
                        return;
                    }
                    try {
                        sshConfig.privateKey = normalizeSshPrivateKey(config.privateKey, config.passphrase);
                    } catch (e: unknown) {
                        reject(e instanceof Error ? e : new Error("Failed to decrypt private key."));
                        return;
                    }
                } else {
                    sshConfig.privateKey = config.privateKey;
                    if (config.passphrase) {
                        sshConfig.passphrase = config.passphrase;
                    }
                }
            } else if (config.authType === "agent") {
                sshConfig.agent = process.env.SSH_AUTH_SOCK;
            } else {
                // Default to password
                sshConfig.password = config.password;
            }

            this.client
                .on("ready", () => {
                    resolve();
                })
                .on("error", (err) => {
                    reject(err);
                })
                .connect(sshConfig);
        });
    }

    public exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        return new Promise((resolve, reject) => {
            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);

                let stdout = "";
                let stderr = "";

                stream
                    .on("close", (code: number | null, signal?: string) => {
                        resolve({ stdout, stderr, code: code ?? (signal ? 128 : 1) });
                    })
                    .on("data", (data: any) => {
                        stdout += data.toString();
                    })
                    .stderr.on("data", (data: any) => {
                        stderr += data.toString();
                    });
            });
        });
    }

    /**
     * Returns the raw SSH stream for piping (binary-safe).
     * Use for streaming dump output or piping restore input.
     */
    public execStream(command: string, callback: (err: Error | undefined, stream: any) => void): void {
        this.client.exec(command, callback);
    }

    /**
     * Upload a local file to the remote server via SFTP.
     * Uses SFTP protocol which guarantees data integrity (unlike piping through exec).
     */
    public uploadFile(localPath: string, remotePath: string, onProgress?: (transferred: number, total: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.sftp((err, sftp) => {
                if (err) return reject(new Error(`SFTP session failed: ${err.message}`));

                const opts: Record<string, any> = {};
                if (onProgress) {
                    opts.step = (totalTransferred: number, _chunk: number, total: number) => {
                        onProgress(totalTransferred, total);
                    };
                }

                sftp.fastPut(localPath, remotePath, opts, (err) => {
                    sftp.end();
                    if (err) return reject(new Error(`SFTP upload failed: ${err.message}`));
                    resolve();
                });
            });
        });
    }

    public end(): void {
        this.client.end();
    }
}
