import { describe, it, expect, vi, beforeEach } from "vitest";
import { MSSQLConfig } from "@/lib/adapters/definitions";

/**
 * Hoisted mock setup for ssh2 Client.
 *
 * The source code chains: this.client.on("ready", fn).on("error", fn).connect(cfg)
 * MockClient stores event handlers internally, returns `this` for chaining,
 * and triggers "ready" or "error" in connect() based on `connectBehavior`.
 */
const { mockConnect, mockSftpFn, mockEnd, connectBehavior, MockClient, PassThrough } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PassThrough } = require("stream") as { PassThrough: typeof import("stream").PassThrough };
    const mockConnect = vi.fn();
    const mockSftpFn = vi.fn();
    const mockEnd = vi.fn();

    // Mutable flag to control connect behavior per test
    const connectBehavior = {
        mode: "ready" as "ready" | "error",
        error: null as Error | null,
    };

    type EventHandler = (...args: unknown[]) => void;

    class MockClient {
        private _handlers: Record<string, EventHandler> = {};

        on(event: string, handler: EventHandler) {
            this._handlers[event] = handler;
            return this; // Return the real instance for chaining
        }

        connect(config: unknown) {
            mockConnect(config);
            if (connectBehavior.mode === "error" && this._handlers["error"]) {
                process.nextTick(() => this._handlers["error"](connectBehavior.error));
            } else if (this._handlers["ready"]) {
                process.nextTick(() => this._handlers["ready"]());
            }
        }

        sftp(cb: (...args: unknown[]) => void) {
            mockSftpFn(cb);
        }

        end() {
            mockEnd();
        }
    }

    return { mockConnect, mockSftpFn, mockEnd, connectBehavior, MockClient, PassThrough };
});

vi.mock("ssh2", () => ({
    Client: MockClient,
}));

vi.mock("fs", () => {
    const createReadStream = vi.fn(() => {
        const stream = new PassThrough();
        process.nextTick(() => stream.end(Buffer.from("fake-data")));
        return stream;
    });

    const createWriteStream = vi.fn(() => {
        const stream = new PassThrough();
        stream.on("pipe", () => {
            process.nextTick(() => stream.emit("finish"));
        });
        return stream;
    });

    return {
        default: { createReadStream, createWriteStream },
        createReadStream,
        createWriteStream,
    };
});

import { MssqlSshTransfer, isSSHTransferEnabled } from "@/lib/adapters/database/mssql/ssh-transfer";

// Helper to build a minimal MSSQL SSH config
function buildSSHConfig(overrides: Partial<MSSQLConfig> = {}): MSSQLConfig {
    return {
        host: "db.example.com",
        port: 1433,
        user: "sa",
        password: "secret",
        database: "testdb",
        encrypt: true,
        trustServerCertificate: false,
        backupPath: "/var/opt/mssql/backup",
        fileTransferMode: "ssh",
        sshHost: "ssh.example.com",
        sshPort: 22,
        sshUsername: "deploy",
        sshAuthType: "password",
        sshPassword: "sshpass",
        requestTimeout: 300000,
        ...overrides,
    };
}

describe("isSSHTransferEnabled", () => {
    it("should return true when fileTransferMode is ssh and sshUsername is set", () => {
        const config = buildSSHConfig();
        expect(isSSHTransferEnabled(config)).toBe(true);
    });

    it("should return false when fileTransferMode is local", () => {
        const config = buildSSHConfig({ fileTransferMode: "local" });
        expect(isSSHTransferEnabled(config)).toBe(false);
    });

    it("should return false when sshUsername is empty", () => {
        const config = buildSSHConfig({ sshUsername: "" });
        expect(isSSHTransferEnabled(config)).toBe(false);
    });

    it("should return false when sshUsername is undefined", () => {
        const config = buildSSHConfig({ sshUsername: undefined });
        expect(isSSHTransferEnabled(config)).toBe(false);
    });

    it("should return false when fileTransferMode is local even with sshUsername", () => {
        const config = buildSSHConfig({
            fileTransferMode: "local",
            sshUsername: "deploy",
        });
        expect(isSSHTransferEnabled(config)).toBe(false);
    });
});

describe("MssqlSshTransfer", () => {
    let transfer: MssqlSshTransfer;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to default behavior: connect triggers "ready"
        connectBehavior.mode = "ready";
        connectBehavior.error = null;
        transfer = new MssqlSshTransfer();
    });

    describe("connect", () => {
        it("should connect with password authentication", async () => {
            const config = buildSSHConfig();
            await transfer.connect(config);

            expect(mockConnect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: "ssh.example.com",
                    port: 22,
                    username: "deploy",
                    password: "sshpass",
                })
            );
        });

        it("should connect with private key authentication", async () => {
            const config = buildSSHConfig({
                sshAuthType: "privateKey",
                sshPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
                sshPassphrase: "keypass",
            });

            await transfer.connect(config);

            expect(mockConnect).toHaveBeenCalledWith(
                expect.objectContaining({
                    privateKey: expect.stringContaining("BEGIN RSA PRIVATE KEY"),
                    passphrase: "keypass",
                })
            );
        });

        it("should connect with SSH agent authentication", async () => {
            const config = buildSSHConfig({ sshAuthType: "agent" });
            process.env.SSH_AUTH_SOCK = "/tmp/ssh-agent.sock";

            await transfer.connect(config);

            expect(mockConnect).toHaveBeenCalledWith(
                expect.objectContaining({
                    agent: "/tmp/ssh-agent.sock",
                })
            );

            delete process.env.SSH_AUTH_SOCK;
        });

        it("should default SSH host to database host when sshHost is not set", async () => {
            const config = buildSSHConfig({ sshHost: undefined });
            await transfer.connect(config);

            expect(mockConnect).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: "db.example.com",
                })
            );
        });

        it("should reject on SSH connection error", async () => {
            connectBehavior.mode = "error";
            connectBehavior.error = new Error("Connection refused");

            const config = buildSSHConfig();
            await expect(transfer.connect(config)).rejects.toThrow(
                "SSH connection failed: Connection refused"
            );
        });
    });

    describe("download", () => {
        it("should download a file from remote to local via SFTP", async () => {
            const mockSftpReadStream = new PassThrough();
            const mockSftp = {
                createReadStream: vi.fn(() => mockSftpReadStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            // Feed data into the SFTP read stream
            process.nextTick(() => {
                mockSftpReadStream.end(Buffer.from("backup-data"));
            });

            await transfer.download("/var/opt/mssql/backup/test.bak", "/tmp/test.bak");

            expect(mockSftp.createReadStream).toHaveBeenCalledWith("/var/opt/mssql/backup/test.bak");
        });
    });

    describe("upload", () => {
        it("should upload a file from local to remote via SFTP", async () => {
            const mockSftpWriteStream = new PassThrough();
            const mockSftp = {
                createWriteStream: vi.fn(() => mockSftpWriteStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            // Emit "close" on the SFTP write stream after data flows
            mockSftpWriteStream.on("pipe", () => {
                process.nextTick(() => mockSftpWriteStream.emit("close"));
            });

            await transfer.upload("/tmp/test.bak", "/var/opt/mssql/backup/test.bak");

            expect(mockSftp.createWriteStream).toHaveBeenCalledWith("/var/opt/mssql/backup/test.bak");
        });
    });

    describe("deleteRemote", () => {
        it("should delete a remote file via SFTP", async () => {
            const mockSftp = {
                unlink: vi.fn((_path: string, cb: (err: null) => void) => cb(null)),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);
            await transfer.deleteRemote("/var/opt/mssql/backup/test.bak");

            expect(mockSftp.unlink).toHaveBeenCalledWith(
                "/var/opt/mssql/backup/test.bak",
                expect.any(Function)
            );
        });

        it("should resolve even if delete fails (non-fatal)", async () => {
            const mockSftp = {
                unlink: vi.fn((_path: string, cb: (err: Error) => void) =>
                    cb(new Error("File not found"))
                ),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            await expect(transfer.deleteRemote("/nonexistent.bak")).resolves.toBeUndefined();
        });
    });

    describe("exists", () => {
        it("should return true when remote file exists", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: null) => void) => cb(null)),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.exists("/var/opt/mssql/backup/test.bak");
            expect(result).toBe(true);
        });

        it("should return false when remote file does not exist", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: Error) => void) =>
                    cb(new Error("No such file"))
                ),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.exists("/nonexistent.bak");
            expect(result).toBe(false);
        });
    });

    describe("end", () => {
        it("should close SSH connection when connected", async () => {
            const config = buildSSHConfig();
            await transfer.connect(config);
            transfer.end();

            expect(mockEnd).toHaveBeenCalled();
        });

        it("should not call end when not connected", () => {
            transfer.end();
            expect(mockEnd).not.toHaveBeenCalled();
        });
    });

    describe("getSftp (error handling)", () => {
        it("should reject when SFTP subsystem fails", async () => {
            mockSftpFn.mockImplementation((cb: (err: Error) => void) => {
                cb(new Error("SFTP subsystem not available"));
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            await expect(transfer.exists("/any")).rejects.toThrow("Failed to initialize SFTP");
        });
    });

    describe("download (error paths)", () => {
        it("should reject when SFTP read stream emits an error", async () => {
            const mockSftpReadStream = new PassThrough();
            const mockSftp = {
                createReadStream: vi.fn(() => mockSftpReadStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            process.nextTick(() => {
                mockSftpReadStream.emit("error", new Error("Remote read failed"));
            });

            await expect(
                transfer.download("/var/opt/mssql/backup/missing.bak", "/tmp/missing.bak")
            ).rejects.toThrow("Failed to download /var/opt/mssql/backup/missing.bak");
        });

        it("should reject when local write stream emits an error", async () => {
            const mockSftpReadStream = new PassThrough();
            const mockSftp = {
                createReadStream: vi.fn(() => mockSftpReadStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            // Override the fs mock for this test: write stream that emits error
            const { createWriteStream } = await vi.importMock<any>("fs");
            const errorStream = new PassThrough();
            createWriteStream.mockReturnValueOnce(errorStream);

            const config = buildSSHConfig();
            await transfer.connect(config);

            process.nextTick(() => {
                errorStream.emit("error", new Error("Disk full"));
            });

            await expect(
                transfer.download("/remote/file.bak", "/tmp/file.bak")
            ).rejects.toThrow("Failed to write to /tmp/file.bak");
        });
    });

    describe("upload (error paths)", () => {
        it("should reject when local read stream emits an error", async () => {
            const mockSftpWriteStream = new PassThrough();
            const mockSftp = {
                createWriteStream: vi.fn(() => mockSftpWriteStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const { createReadStream } = await vi.importMock<any>("fs");
            const errorReadStream = new PassThrough();
            createReadStream.mockReturnValueOnce(errorReadStream);

            const config = buildSSHConfig();
            await transfer.connect(config);

            process.nextTick(() => {
                errorReadStream.emit("error", new Error("File not found"));
            });

            await expect(
                transfer.upload("/tmp/missing.bak", "/remote/missing.bak")
            ).rejects.toThrow("Failed to read /tmp/missing.bak");
        });

        it("should reject when SFTP write stream emits an error", async () => {
            const mockSftpWriteStream = new PassThrough();
            const mockSftp = {
                createWriteStream: vi.fn(() => mockSftpWriteStream),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            // Return the mock sftp write stream (default createReadStream sends data)
            const config = buildSSHConfig();
            await transfer.connect(config);

            process.nextTick(() => {
                mockSftpWriteStream.emit("error", new Error("Remote write failed"));
            });

            await expect(
                transfer.upload("/tmp/local.bak", "/remote/local.bak")
            ).rejects.toThrow("Failed to upload to /remote/local.bak");
        });
    });

    describe("testBackupPath", () => {
        it("should return readable and writable when directory exists and write succeeds", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: null, stats: any) => void) =>
                    cb(null, { isDirectory: () => true })
                ),
                writeFile: vi.fn((_path: string, _data: any, cb: (err: null) => void) => cb(null)),
                unlink: vi.fn((_path: string, cb: () => void) => cb()),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.testBackupPath("/var/opt/mssql/backup");

            expect(result.readable).toBe(true);
            expect(result.writable).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it("should return not readable when directory does not exist", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: Error) => void) =>
                    cb(new Error("No such file or directory"))
                ),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.testBackupPath("/nonexistent/path");

            expect(result.readable).toBe(false);
            expect(result.writable).toBe(false);
            expect(result.error).toContain("does not exist");
        });

        it("should return readable but not writable when directory exists but write fails", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: null, stats: any) => void) =>
                    cb(null, { isDirectory: () => true })
                ),
                writeFile: vi.fn((_path: string, _data: any, cb: (err: Error) => void) =>
                    cb(new Error("Permission denied"))
                ),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.testBackupPath("/readonly/backup");

            expect(result.readable).toBe(true);
            expect(result.writable).toBe(false);
            expect(result.error).toContain("readable but not writable");
        });

        it("should return not readable when stat path is a file not a directory", async () => {
            const mockSftp = {
                stat: vi.fn((_path: string, cb: (err: null, stats: any) => void) =>
                    cb(null, { isDirectory: () => false })
                ),
            };

            mockSftpFn.mockImplementation((cb: (err: null, sftp: any) => void) => {
                cb(null, mockSftp);
            });

            const config = buildSSHConfig();
            await transfer.connect(config);

            const result = await transfer.testBackupPath("/some/file.bak");

            expect(result.readable).toBe(false);
            expect(result.writable).toBe(false);
        });
    });
});
