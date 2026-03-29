import { Client, ConnectConfig, SFTPWrapper } from "ssh2";

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
                sshConfig.privateKey = config.privateKey;
                if (config.passphrase) {
                    sshConfig.passphrase = config.passphrase;
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
    public uploadFile(localPath: string, remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.sftp((err, sftp) => {
                if (err) return reject(new Error(`SFTP session failed: ${err.message}`));

                sftp.fastPut(localPath, remotePath, (err) => {
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
