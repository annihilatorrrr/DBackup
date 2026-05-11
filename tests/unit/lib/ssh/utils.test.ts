import { describe, it, expect, vi } from "vitest";
import {
    shellEscape,
    remoteEnv,
    remoteBinaryCheck,
    isSSHMode,
    extractSshConfig,
    extractSqliteSshConfig,
    buildMysqlArgs,
    withRemoteMyCnf,
    buildPsqlArgs,
    buildMongoArgs,
    buildRedisArgs,
} from "@/lib/ssh";
import type { SshClient } from "@/lib/ssh";

// ─── remoteBinaryCheck ──────────────────────────────────────────────

describe("remoteBinaryCheck", () => {
    it("returns trimmed path when the first candidate is found", async () => {
        const client = {
            exec: vi.fn().mockResolvedValue({ code: 0, stdout: "/usr/bin/pg_dump\n", stderr: "" }),
        } as unknown as SshClient;

        const result = await remoteBinaryCheck(client, "pg_dump");
        expect(result).toBe("/usr/bin/pg_dump");
    });

    it("tries the next candidate when the first is not found", async () => {
        const client = {
            exec: vi
                .fn()
                .mockResolvedValueOnce({ code: 1, stdout: "", stderr: "" })
                .mockResolvedValueOnce({ code: 0, stdout: "/usr/bin/pg_dump14\n", stderr: "" }),
        } as unknown as SshClient;

        const result = await remoteBinaryCheck(client, "pg_dump", "pg_dump14");
        expect(result).toBe("/usr/bin/pg_dump14");
    });

    it("throws when no candidate is found", async () => {
        const client = {
            exec: vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "" }),
        } as unknown as SshClient;

        await expect(remoteBinaryCheck(client, "pg_dump", "pg_dump15")).rejects.toThrow(
            "Required binary not found on remote server. Tried: pg_dump, pg_dump15"
        );
    });
});

// ─── shellEscape ─────────────────────────────────────────────────────

describe("shellEscape", () => {
    it("should wrap a simple string in single quotes", () => {
        expect(shellEscape("hello")).toBe("'hello'");
    });

    it("should escape embedded single quotes", () => {
        expect(shellEscape("it's")).toBe("'it'\\''s'");
    });

    it("should handle multiple single quotes", () => {
        expect(shellEscape("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''");
    });

    it("should handle empty string", () => {
        expect(shellEscape("")).toBe("''");
    });

    it("should preserve special shell characters inside single quotes", () => {
        expect(shellEscape("$(rm -rf /)")).toBe("'$(rm -rf /)'");
        expect(shellEscape("hello; echo pwned")).toBe("'hello; echo pwned'");
        expect(shellEscape("a&b|c")).toBe("'a&b|c'");
    });

    it("should handle strings with only a single quote", () => {
        expect(shellEscape("'")).toBe("''\\'''");
    });

    it("should handle backslashes", () => {
        expect(shellEscape("back\\slash")).toBe("'back\\slash'");
    });

    it("should handle newlines and tabs", () => {
        expect(shellEscape("line1\nline2")).toBe("'line1\nline2'");
        expect(shellEscape("col1\tcol2")).toBe("'col1\tcol2'");
    });
});

// ─── remoteEnv ───────────────────────────────────────────────────────

describe("remoteEnv", () => {
    it("should return the command unchanged when no vars are provided", () => {
        expect(remoteEnv({}, "mysqldump mydb")).toBe("mysqldump mydb");
    });

    it("should export a single env var before the command", () => {
        const result = remoteEnv({ MYSQL_PWD: "secret" }, "mysqldump mydb");
        expect(result).toBe("export MYSQL_PWD='secret'; mysqldump mydb");
    });

    it("should export multiple env vars separated by semicolons", () => {
        const result = remoteEnv({ MYSQL_PWD: "pw", LC_ALL: "C" }, "cmd");
        expect(result).toBe("export MYSQL_PWD='pw'; export LC_ALL='C'; cmd");
    });

    it("should filter out undefined values", () => {
        const result = remoteEnv({ MYSQL_PWD: undefined, LC_ALL: "C" }, "cmd");
        expect(result).toBe("export LC_ALL='C'; cmd");
    });

    it("should filter out empty string values", () => {
        const result = remoteEnv({ MYSQL_PWD: "", LC_ALL: "C" }, "cmd");
        expect(result).toBe("export LC_ALL='C'; cmd");
    });

    it("should return command unchanged when all values are undefined/empty", () => {
        const result = remoteEnv({ A: undefined, B: "" }, "cmd");
        expect(result).toBe("cmd");
    });

    it("should escape single quotes in values", () => {
        const result = remoteEnv({ PASS: "it's" }, "cmd");
        expect(result).toBe("export PASS='it'\\''s'; cmd");
    });
});

// ─── isSSHMode ───────────────────────────────────────────────────────

describe("isSSHMode", () => {
    it("should return true when connectionMode is ssh", () => {
        expect(isSSHMode({ connectionMode: "ssh" })).toBe(true);
    });

    it("should return false when connectionMode is direct", () => {
        expect(isSSHMode({ connectionMode: "direct" })).toBe(false);
    });

    it("should return false when connectionMode is missing", () => {
        expect(isSSHMode({})).toBe(false);
    });

    it("should return false for unrelated values", () => {
        expect(isSSHMode({ connectionMode: "tunnel" })).toBe(false);
        expect(isSSHMode({ connectionMode: "" })).toBe(false);
    });
});

// ─── extractSshConfig ────────────────────────────────────────────────

describe("extractSshConfig", () => {
    const validConfig = {
        connectionMode: "ssh",
        sshHost: "10.0.0.1",
        sshPort: 2222,
        sshUsername: "deploy",
        sshAuthType: "password",
        sshPassword: "secret",
    };

    it("should extract a valid SSH config", () => {
        const result = extractSshConfig(validConfig);
        expect(result).toEqual({
            host: "10.0.0.1",
            port: 2222,
            username: "deploy",
            authType: "password",
            password: "secret",
            privateKey: undefined,
            passphrase: undefined,
        });
    });

    it("should return null when connectionMode is not ssh", () => {
        expect(extractSshConfig({ ...validConfig, connectionMode: "direct" })).toBeNull();
    });

    it("should return null when sshHost is missing", () => {
        const { sshHost: _, ...noHost } = validConfig;
        expect(extractSshConfig(noHost)).toBeNull();
    });

    it("should return null when sshUsername is missing", () => {
        const { sshUsername: _, ...noUser } = validConfig;
        expect(extractSshConfig(noUser)).toBeNull();
    });

    it("should default port to 22 when not provided", () => {
        const { sshPort: _, ...noPort } = validConfig;
        const result = extractSshConfig(noPort);
        expect(result?.port).toBe(22);
    });

    it("should default authType to password when not provided", () => {
        const { sshAuthType: _, ...noAuthType } = validConfig;
        const result = extractSshConfig(noAuthType);
        expect(result?.authType).toBe("password");
    });

    it("should extract privateKey auth config", () => {
        const config = {
            connectionMode: "ssh",
            sshHost: "10.0.0.1",
            sshUsername: "deploy",
            sshAuthType: "privateKey",
            sshPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
            sshPassphrase: "keypass",
        };
        const result = extractSshConfig(config);
        expect(result?.authType).toBe("privateKey");
        expect(result?.privateKey).toBe("-----BEGIN OPENSSH PRIVATE KEY-----\n...");
        expect(result?.passphrase).toBe("keypass");
    });
});

// ─── extractSqliteSshConfig ──────────────────────────────────────────

describe("extractSqliteSshConfig", () => {
    const validConfig = {
        mode: "ssh",
        host: "10.0.0.1",
        port: 2222,
        username: "deploy",
        authType: "password",
        password: "secret",
    };

    it("should extract a valid SQLite SSH config", () => {
        const result = extractSqliteSshConfig(validConfig);
        expect(result).toEqual({
            host: "10.0.0.1",
            port: 2222,
            username: "deploy",
            authType: "password",
            password: "secret",
            privateKey: undefined,
            passphrase: undefined,
        });
    });

    it("should return null when mode is not ssh", () => {
        expect(extractSqliteSshConfig({ ...validConfig, mode: "local" })).toBeNull();
    });

    it("should return null when host is missing", () => {
        const { host: _, ...noHost } = validConfig;
        expect(extractSqliteSshConfig(noHost)).toBeNull();
    });

    it("should return null when username is missing", () => {
        const { username: _, ...noUser } = validConfig;
        expect(extractSqliteSshConfig(noUser)).toBeNull();
    });

    it("should default port to 22 when not provided", () => {
        const { port: _, ...noPort } = validConfig;
        const result = extractSqliteSshConfig(noPort);
        expect(result?.port).toBe(22);
    });

    it("should default authType to password when not provided", () => {
        const { authType: _, ...noAuthType } = validConfig;
        const result = extractSqliteSshConfig(noAuthType);
        expect(result?.authType).toBe("password");
    });
});

// ─── buildMysqlArgs ──────────────────────────────────────────────────

describe("buildMysqlArgs", () => {
    it("should build default args with host, port, user", () => {
        const args = buildMysqlArgs({ host: "db.local", port: 3307, user: "root" });
        expect(args).toEqual([
            "-h", "'db.local'",
            "-P", "3307",
            "-u", "'root'",
        ]);
    });

    it("should default host to 127.0.0.1 and port to 3306", () => {
        const args = buildMysqlArgs({ user: "root" });
        expect(args).toContain("'127.0.0.1'");
        expect(args).toContain("3306");
    });

    it("should use override user parameter", () => {
        const args = buildMysqlArgs({ user: "app" }, "admin");
        expect(args).toContain("'admin'");
        expect(args).not.toContain("'app'");
    });

    it("should add --skip-ssl when disableSsl is true", () => {
        const args = buildMysqlArgs({ user: "root", disableSsl: true });
        expect(args).toContain("--skip-ssl");
    });

    it("should not add --skip-ssl when disableSsl is false/missing", () => {
        const args = buildMysqlArgs({ user: "root", disableSsl: false });
        expect(args).not.toContain("--skip-ssl");

        const args2 = buildMysqlArgs({ user: "root" });
        expect(args2).not.toContain("--skip-ssl");
    });

    it("should not include --protocol=tcp for SSH mode", () => {
        const args = buildMysqlArgs({ user: "root" });
        expect(args).not.toContain("--protocol=tcp");
    });
});

// ─── withRemoteMyCnf ─────────────────────────────────────────────────

describe("withRemoteMyCnf", () => {
    function makeMockSsh() {
        return {
            uploadFile: vi.fn().mockResolvedValue(undefined),
            exec: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
        } as unknown as SshClient;
    }

    it("calls callback with a remote cnf path when password is set", async () => {
        const ssh = makeMockSsh();
        let receivedPath: string | undefined;
        await withRemoteMyCnf(ssh, "secret", async (p) => { receivedPath = p; });

        expect(receivedPath).toMatch(/^\/tmp\/dbackup_.*\.cnf$/);
        expect(ssh.uploadFile).toHaveBeenCalledTimes(1);
    });

    it("calls callback with undefined and skips upload when password is undefined", async () => {
        const ssh = makeMockSsh();
        let receivedPath: string | undefined = "NOT_CALLED";
        await withRemoteMyCnf(ssh, undefined, async (p) => { receivedPath = p; });

        expect(receivedPath).toBeUndefined();
        expect(ssh.uploadFile).not.toHaveBeenCalled();
    });

    it("deletes the remote file after callback completes", async () => {
        const ssh = makeMockSsh();
        let remotePath: string | undefined;
        await withRemoteMyCnf(ssh, "secret", async (p) => { remotePath = p; });

        const execCalls = (ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0] as string);
        expect(execCalls.some((cmd: string) => cmd.startsWith("rm -f") && cmd.includes(remotePath!))).toBe(true);
    });

    it("deletes the remote file even when the callback throws", async () => {
        const ssh = makeMockSsh();
        let remotePath: string | undefined;
        await withRemoteMyCnf(ssh, "secret", async (p) => {
            remotePath = p;
            throw new Error("backup failed");
        }).catch(() => {});

        const execCalls = (ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0] as string);
        expect(execCalls.some((cmd: string) => cmd.startsWith("rm -f") && cmd.includes(remotePath!))).toBe(true);
    });

    it("writes password into the .my.cnf content (not as a command argument)", async () => {
        const ssh = makeMockSsh();
        await withRemoteMyCnf(ssh, "s3cr3t!", async () => {});

        // The password must NOT appear in any exec() call (it travels via SFTP binary transfer only)
        const execCalls = (ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0] as string);
        expect(execCalls.every((cmd: string) => !cmd.includes("s3cr3t!"))).toBe(true);
    });
});

// ─── buildPsqlArgs ───────────────────────────────────────────────────

describe("buildPsqlArgs", () => {
    it("should build args with host, port, user", () => {
        const args = buildPsqlArgs({ host: "pg.local", port: 5433, user: "postgres" });
        expect(args).toEqual([
            "-h", "'pg.local'",
            "-p", "5433",
            "-U", "'postgres'",
        ]);
    });

    it("should default host to 127.0.0.1 and port to 5432", () => {
        const args = buildPsqlArgs({ user: "postgres" });
        expect(args).toContain("'127.0.0.1'");
        expect(args).toContain("5432");
    });

    it("should use override user parameter", () => {
        const args = buildPsqlArgs({ user: "app" }, "superuser");
        expect(args).toContain("'superuser'");
        expect(args).not.toContain("'app'");
    });
});

// ─── buildMongoArgs ──────────────────────────────────────────────────

describe("buildMongoArgs", () => {
    it("should return URI arg when uri is provided", () => {
        const args = buildMongoArgs({ uri: "mongodb://user:pass@host:27017/db" });
        expect(args).toEqual(["--uri='mongodb://user:pass@host:27017/db'"]);
    });

    it("should build host/port args without auth", () => {
        const args = buildMongoArgs({ host: "mongo.local", port: 27018 });
        expect(args).toEqual([
            "--host", "'mongo.local'",
            "--port", "27018",
        ]);
    });

    it("should add auth args when user and password are provided", () => {
        const args = buildMongoArgs({
            host: "mongo.local",
            port: 27017,
            user: "admin",
            password: "secret",
        });
        expect(args).toContain("--username");
        expect(args).toContain("'admin'");
        expect(args).toContain("--password");
        expect(args).toContain("'secret'");
        expect(args).toContain("--authenticationDatabase");
        expect(args).toContain("'admin'"); // default authDB
    });

    it("should use custom authenticationDatabase", () => {
        const args = buildMongoArgs({
            host: "mongo.local",
            user: "admin",
            password: "secret",
            authenticationDatabase: "myAuthDb",
        });
        expect(args).toContain("'myAuthDb'");
    });

    it("should not add auth args when only user is provided (no password)", () => {
        const args = buildMongoArgs({ host: "mongo.local", user: "admin" });
        expect(args).not.toContain("--username");
    });

    it("should default host to 127.0.0.1 and port to 27017", () => {
        const args = buildMongoArgs({});
        expect(args).toContain("'127.0.0.1'");
        expect(args).toContain("27017");
    });

    it("should prefer URI over host/port when both are present", () => {
        const args = buildMongoArgs({
            uri: "mongodb://host/db",
            host: "other.host",
            port: 27018,
        });
        expect(args).toHaveLength(1);
        expect(args[0]).toContain("mongodb://host/db");
    });
});

// ─── buildRedisArgs ──────────────────────────────────────────────────

describe("buildRedisArgs", () => {
    it("should build default args with host and port", () => {
        const args = buildRedisArgs({ host: "redis.local", port: 6380 });
        expect(args).toEqual([
            "-h", "'redis.local'",
            "-p", "6380",
        ]);
    });

    it("should default host to 127.0.0.1 and port to 6379", () => {
        const args = buildRedisArgs({});
        expect(args).toContain("'127.0.0.1'");
        expect(args).toContain("6379");
    });

    it("should add username when provided", () => {
        const args = buildRedisArgs({ username: "redisuser" });
        expect(args).toContain("--user");
        expect(args).toContain("'redisuser'");
    });

    it("should not add username when not provided", () => {
        const args = buildRedisArgs({});
        expect(args).not.toContain("--user");
    });

    it("should add password when provided", () => {
        const args = buildRedisArgs({ password: "redispass" });
        expect(args).toContain("-a");
        expect(args).toContain("'redispass'");
    });

    it("should not add password when not provided", () => {
        const args = buildRedisArgs({});
        expect(args).not.toContain("-a");
    });

    it("should add --tls when tls is enabled", () => {
        const args = buildRedisArgs({ tls: true });
        expect(args).toContain("--tls");
    });

    it("should not add --tls when tls is disabled/missing", () => {
        expect(buildRedisArgs({ tls: false })).not.toContain("--tls");
        expect(buildRedisArgs({})).not.toContain("--tls");
    });

    it("should add database number when non-zero", () => {
        const args = buildRedisArgs({ database: 5 });
        expect(args).toContain("-n");
        expect(args).toContain("5");
    });

    it("should not add database number when 0 (default)", () => {
        const args = buildRedisArgs({ database: 0 });
        expect(args).not.toContain("-n");
    });

    it("should not add database number when undefined", () => {
        const args = buildRedisArgs({});
        expect(args).not.toContain("-n");
    });

    it("should combine all options", () => {
        const args = buildRedisArgs({
            host: "redis.prod",
            port: 6380,
            username: "user",
            password: "pass",
            tls: true,
            database: 3,
        });
        expect(args).toEqual([
            "-h", "'redis.prod'",
            "-p", "6380",
            "--user", "'user'",
            "-a", "'pass'",
            "--tls",
            "-n", "3",
        ]);
    });
});
