import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("ssh2", () => ({ Client: vi.fn() }));

import { Client } from "ssh2";
import { SshClient } from "@/lib/ssh";

// Typed shorthand for the mocked constructor
const MockClient = Client as unknown as ReturnType<typeof vi.fn>;

type MockInstance = EventEmitter & {
    connect: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    sftp: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
};

describe("SshClient", () => {
    let mockInstance: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInstance = Object.assign(new EventEmitter(), {
            connect: vi.fn(),
            exec: vi.fn(),
            sftp: vi.fn(),
            end: vi.fn(),
        }) as MockInstance;
        // Use a regular function (not arrow) so `new Client()` works correctly.
        // Returning an object from a constructor makes `new` yield that object.
        MockClient.mockImplementation(function () { return mockInstance; });
    });

    // ─── connect() ───────────────────────────────────────────────────

    describe("connect()", () => {
        it("resolves when the ready event fires (password auth)", async () => {
            const client = new SshClient();
            const promise = client.connect({
                host: "myhost",
                username: "user",
                authType: "password",
                password: "pw",
            });

            mockInstance.emit("ready");
            await expect(promise).resolves.toBeUndefined();
            expect(mockInstance.connect).toHaveBeenCalledWith(
                expect.objectContaining({ host: "myhost", username: "user", password: "pw", port: 22 })
            );
        });

        it("uses the provided port instead of the default 22", async () => {
            const client = new SshClient();
            const promise = client.connect({ host: "h", port: 2222, username: "u", authType: "password" });

            mockInstance.emit("ready");
            await promise;
            expect(mockInstance.connect).toHaveBeenCalledWith(
                expect.objectContaining({ port: 2222 })
            );
        });

        it("rejects when the error event fires", async () => {
            const client = new SshClient();
            const promise = client.connect({ host: "h", username: "u", authType: "password" });

            mockInstance.emit("error", new Error("connection refused"));
            await expect(promise).rejects.toThrow("connection refused");
        });

        it("sets privateKey and passphrase for privateKey auth", async () => {
            const client = new SshClient();
            const promise = client.connect({
                host: "h",
                username: "u",
                authType: "privateKey",
                privateKey: "-----BEGIN RSA KEY-----",
                passphrase: "keyphrase",
            });

            mockInstance.emit("ready");
            await promise;
            expect(mockInstance.connect).toHaveBeenCalledWith(
                expect.objectContaining({
                    privateKey: "-----BEGIN RSA KEY-----",
                    passphrase: "keyphrase",
                })
            );
        });

        it("sets privateKey without passphrase when passphrase is not provided", async () => {
            const client = new SshClient();
            const promise = client.connect({
                host: "h",
                username: "u",
                authType: "privateKey",
                privateKey: "-----BEGIN RSA KEY-----",
            });

            mockInstance.emit("ready");
            await promise;
            const callArg = mockInstance.connect.mock.calls[0][0];
            expect(callArg.privateKey).toBe("-----BEGIN RSA KEY-----");
            expect(callArg.passphrase).toBeUndefined();
        });

        it("sets agent from SSH_AUTH_SOCK for agent auth", async () => {
            vi.stubEnv("SSH_AUTH_SOCK", "/tmp/ssh-agent.sock");
            const client = new SshClient();
            const promise = client.connect({ host: "h", username: "u", authType: "agent" });

            mockInstance.emit("ready");
            await promise;
            expect(mockInstance.connect).toHaveBeenCalledWith(
                expect.objectContaining({ agent: "/tmp/ssh-agent.sock" })
            );
            vi.unstubAllEnvs();
        });
    });

    // ─── exec() ──────────────────────────────────────────────────────

    describe("exec()", () => {
        it("resolves with stdout, stderr, and the exit code", async () => {
            const client = new SshClient();
            mockInstance.exec.mockImplementation((cmd: string, cb: (err: null, stream: EventEmitter) => void) => {
                const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
                stream.stderr = new EventEmitter();
                cb(null, stream);
                stream.emit("data", Buffer.from("hello\n"));
                stream.stderr.emit("data", Buffer.from("warn\n"));
                stream.emit("close", 0, null);
            });

            const result = await client.exec("echo hello");
            expect(result).toEqual({ stdout: "hello\n", stderr: "warn\n", code: 0 });
        });

        it("rejects when exec returns an error", async () => {
            const client = new SshClient();
            mockInstance.exec.mockImplementation((cmd: string, cb: (err: Error) => void) => {
                cb(new Error("exec failed"));
            });

            await expect(client.exec("ls")).rejects.toThrow("exec failed");
        });

        it("returns code 128 when the stream closes with a signal (no numeric code)", async () => {
            const client = new SshClient();
            mockInstance.exec.mockImplementation((cmd: string, cb: (err: null, stream: EventEmitter) => void) => {
                const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
                stream.stderr = new EventEmitter();
                cb(null, stream);
                stream.emit("close", null, "SIGKILL");
            });

            const result = await client.exec("sleep 100");
            expect(result.code).toBe(128);
        });

        it("returns code 1 when both code and signal are absent", async () => {
            const client = new SshClient();
            mockInstance.exec.mockImplementation((cmd: string, cb: (err: null, stream: EventEmitter) => void) => {
                const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
                stream.stderr = new EventEmitter();
                cb(null, stream);
                stream.emit("close", null, null);
            });

            const result = await client.exec("cmd");
            expect(result.code).toBe(1);
        });

        it("accumulates data across multiple chunks", async () => {
            const client = new SshClient();
            mockInstance.exec.mockImplementation((cmd: string, cb: (err: null, stream: EventEmitter) => void) => {
                const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
                stream.stderr = new EventEmitter();
                cb(null, stream);
                stream.emit("data", Buffer.from("chunk1"));
                stream.emit("data", Buffer.from("chunk2"));
                stream.emit("close", 0, null);
            });

            const result = await client.exec("cat file");
            expect(result.stdout).toBe("chunk1chunk2");
        });
    });

    // ─── execStream() ────────────────────────────────────────────────

    describe("execStream()", () => {
        it("delegates directly to the underlying client exec", () => {
            const client = new SshClient();
            const cb = vi.fn();
            client.execStream("tar -c /data", cb);
            expect(mockInstance.exec).toHaveBeenCalledWith("tar -c /data", cb);
        });
    });

    // ─── uploadFile() ────────────────────────────────────────────────

    describe("uploadFile()", () => {
        it("resolves when the SFTP upload succeeds", async () => {
            const client = new SshClient();
            const sftpSession = { fastPut: vi.fn(), end: vi.fn() };
            sftpSession.fastPut.mockImplementation(
                (_l: string, _r: string, _opts: object, cb: (err: null) => void) => cb(null)
            );
            mockInstance.sftp.mockImplementation((cb: (err: null, sftp: typeof sftpSession) => void) =>
                cb(null, sftpSession)
            );

            await expect(client.uploadFile("/local/file", "/remote/file")).resolves.toBeUndefined();
            expect(sftpSession.fastPut).toHaveBeenCalled();
            expect(sftpSession.end).toHaveBeenCalled();
        });

        it("rejects when the SFTP session itself fails", async () => {
            const client = new SshClient();
            mockInstance.sftp.mockImplementation((cb: (err: Error) => void) =>
                cb(new Error("SFTP not available"))
            );

            await expect(client.uploadFile("/local", "/remote")).rejects.toThrow("SFTP session failed");
        });

        it("rejects when fastPut reports an error and still calls sftp.end", async () => {
            const client = new SshClient();
            const sftpSession = { fastPut: vi.fn(), end: vi.fn() };
            sftpSession.fastPut.mockImplementation(
                (_l: string, _r: string, _opts: object, cb: (err: Error) => void) => cb(new Error("disk full"))
            );
            mockInstance.sftp.mockImplementation((cb: (err: null, sftp: typeof sftpSession) => void) =>
                cb(null, sftpSession)
            );

            await expect(client.uploadFile("/local", "/remote")).rejects.toThrow("SFTP upload failed");
            expect(sftpSession.end).toHaveBeenCalled();
        });

        it("invokes the onProgress callback via the fastPut step option", async () => {
            const client = new SshClient();
            const onProgress = vi.fn();
            const sftpSession = { fastPut: vi.fn(), end: vi.fn() };
            let capturedStep: ((transferred: number, chunk: number, total: number) => void) | undefined;

            sftpSession.fastPut.mockImplementation(
                (_l: string, _r: string, opts: { step?: typeof capturedStep }, cb: (err: null) => void) => {
                    capturedStep = opts.step;
                    cb(null);
                }
            );
            mockInstance.sftp.mockImplementation((cb: (err: null, sftp: typeof sftpSession) => void) =>
                cb(null, sftpSession)
            );

            await client.uploadFile("/local", "/remote", onProgress);
            capturedStep!(500, 100, 1000);
            expect(onProgress).toHaveBeenCalledWith(500, 1000);
        });

        it("does not set the step option when no onProgress is provided", async () => {
            const client = new SshClient();
            const sftpSession = { fastPut: vi.fn(), end: vi.fn() };
            let capturedOpts: Record<string, unknown> = {};

            sftpSession.fastPut.mockImplementation(
                (_l: string, _r: string, opts: Record<string, unknown>, cb: (err: null) => void) => {
                    capturedOpts = opts;
                    cb(null);
                }
            );
            mockInstance.sftp.mockImplementation((cb: (err: null, sftp: typeof sftpSession) => void) =>
                cb(null, sftpSession)
            );

            await client.uploadFile("/local", "/remote");
            expect(capturedOpts.step).toBeUndefined();
        });
    });

    // ─── end() ───────────────────────────────────────────────────────

    describe("end()", () => {
        it("calls end on the underlying ssh2 client", () => {
            const client = new SshClient();
            client.end();
            expect(mockInstance.end).toHaveBeenCalled();
        });
    });
});
