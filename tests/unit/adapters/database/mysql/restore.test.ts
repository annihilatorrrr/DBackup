import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySQLConfig } from "@/lib/adapters/definitions";

// --- Hoisted mocks ---

const {
    mockEnsureDatabase,
    mockIsMultiDbTar,
    mockExtractSelectedDatabases,
    mockCreateTempDir,
    mockCleanupTempDir,
    mockShouldRestoreDatabase,
    mockGetTargetDatabaseName,
    mockSpawnProcess,
    mockWaitForProcess,
    mockFsStat,
    mockCreateReadStream,
    mockIsSSHMode,
    PassThrough,
} = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PassThrough } = require("stream") as { PassThrough: typeof import("stream").PassThrough };
    return {
        mockEnsureDatabase: vi.fn(),
        mockIsMultiDbTar: vi.fn(),
        mockExtractSelectedDatabases: vi.fn(),
        mockCreateTempDir: vi.fn(),
        mockCleanupTempDir: vi.fn(),
        mockShouldRestoreDatabase: vi.fn(),
        mockGetTargetDatabaseName: vi.fn(),
        mockSpawnProcess: vi.fn(),
        mockWaitForProcess: vi.fn(),
        mockFsStat: vi.fn(),
        mockCreateReadStream: vi.fn(),
        mockIsSSHMode: vi.fn(),
        PassThrough,
    };
});

vi.mock("@/lib/adapters/database/mysql/connection", () => ({
    ensureDatabase: (...args: any[]) => mockEnsureDatabase(...args),
    execFileAsync: vi.fn(),
}));

vi.mock("@/lib/adapters/database/mysql/tools", () => ({
    getMysqlCommand: vi.fn(() => "mysql"),
    getMysqldumpCommand: vi.fn(() => "mysqldump"),
    getMysqladminCommand: vi.fn(() => "mysqladmin"),
    initMysqlTools: vi.fn(),
}));

vi.mock("@/lib/adapters/database/mysql/dialects", () => ({
    getDialect: vi.fn(() => ({
        getDumpArgs: vi.fn(),
        getRestoreArgs: vi.fn(() => ["--host=localhost", "--user=root", "testdb"]),
    })),
}));

vi.mock("@/lib/adapters/database/common/tar-utils", () => ({
    isMultiDbTar: (...args: any[]) => mockIsMultiDbTar(...args),
    extractSelectedDatabases: (...args: any[]) => mockExtractSelectedDatabases(...args),
    createTempDir: (...args: any[]) => mockCreateTempDir(...args),
    cleanupTempDir: (...args: any[]) => mockCleanupTempDir(...args),
    shouldRestoreDatabase: (...args: any[]) => mockShouldRestoreDatabase(...args),
    getTargetDatabaseName: (...args: any[]) => mockGetTargetDatabaseName(...args),
}));

vi.mock("child_process", () => ({
    spawn: (...args: any[]) => mockSpawnProcess(...args),
    default: { spawn: (...args: any[]) => mockSpawnProcess(...args) },
}));

vi.mock("@/lib/adapters/process", () => ({
    waitForProcess: (...args: any[]) => mockWaitForProcess(...args),
}));

vi.mock("@/lib/ssh", () => ({
    SshClient: class {
        connect = vi.fn();
        exec = vi.fn();
        execStream = vi.fn();
        uploadFile = vi.fn();
        end = vi.fn();
    },
    isSSHMode: (...args: any[]) => mockIsSSHMode(...args),
    extractSshConfig: vi.fn(),
    buildMysqlArgs: vi.fn(() => []),
    remoteEnv: vi.fn((env: any, cmd: string) => cmd),
    remoteBinaryCheck: vi.fn(),
    shellEscape: vi.fn((s: string) => s),
}));

vi.mock("fs/promises", () => ({
    default: { stat: (...args: any[]) => mockFsStat(...args) },
    stat: (...args: any[]) => mockFsStat(...args),
}));

vi.mock("fs", () => ({
    default: { createReadStream: (...args: any[]) => mockCreateReadStream(...args) },
    createReadStream: (...args: any[]) => mockCreateReadStream(...args),
}));

vi.mock("crypto", () => ({
    randomUUID: vi.fn(() => "test-uuid-1234"),
    default: { randomUUID: vi.fn(() => "test-uuid-1234") },
}));

import { prepareRestore, restore } from "@/lib/adapters/database/mysql/restore";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildConfig(overrides: Record<string, any> = {}): MySQLConfig & Record<string, any> {
    return {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "secret",
        database: "testdb",
        disableSsl: false,
        ...overrides,
    } as any;
}

function makeSpawnProcess() {
    const proc = new PassThrough() as any;
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.kill = vi.fn();
    return proc;
}

// -------------------------------------------------------------------------
// prepareRestore()
// -------------------------------------------------------------------------

describe("prepareRestore()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
        mockEnsureDatabase.mockResolvedValue(undefined);
    });

    it("calls ensureDatabase for each database in the list", async () => {
        const config = buildConfig();

        await prepareRestore(config, ["db1", "db2"]);

        expect(mockEnsureDatabase).toHaveBeenCalledTimes(2);
        expect(mockEnsureDatabase).toHaveBeenCalledWith(config, "db1", "root", "secret", false, []);
        expect(mockEnsureDatabase).toHaveBeenCalledWith(config, "db2", "root", "secret", false, []);
    });

    it("uses privilegedAuth credentials when provided", async () => {
        const config = buildConfig({
            privilegedAuth: { user: "admin", password: "adminpw" },
        });

        await prepareRestore(config, ["mydb"]);

        expect(mockEnsureDatabase).toHaveBeenCalledWith(
            config, "mydb", "admin", "adminpw", true, []
        );
    });

    it("does nothing when the database list is empty", async () => {
        await prepareRestore(buildConfig(), []);

        expect(mockEnsureDatabase).not.toHaveBeenCalled();
    });
});

// -------------------------------------------------------------------------
// restore() - error paths
// -------------------------------------------------------------------------

describe("restore() - error paths", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
        mockIsMultiDbTar.mockResolvedValue(false);
    });

    it("returns failure when no target database is specified", async () => {
        const config = buildConfig({ database: undefined });

        const result = await restore(config, "/fake/dump.sql");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No target database specified/i);
    });

    it("returns failure when no databases are selected in dbMapping", async () => {
        const config = buildConfig({
            database: undefined,
            databaseMapping: [
                { originalName: "shop", targetName: "shop", selected: false },
            ],
        });

        const result = await restore(config, "/fake/dump.sql");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No databases selected/i);
    });
});

// -------------------------------------------------------------------------
// restore() - single database success
// -------------------------------------------------------------------------

describe("restore() - single database", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
        mockIsMultiDbTar.mockResolvedValue(false);
        mockEnsureDatabase.mockResolvedValue(undefined);
        mockFsStat.mockResolvedValue({ size: 1024 });
        mockWaitForProcess.mockResolvedValue(undefined);
        mockCreateReadStream.mockImplementation(() => {
            const stream = new PassThrough();
            process.nextTick(() => stream.end(Buffer.from("sql-content")));
            return stream;
        });
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess());
    });

    it("restores a single database successfully", async () => {
        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        expect(result.success).toBe(true);
        expect(mockSpawnProcess).toHaveBeenCalledWith("mysql", expect.any(Array), expect.any(Object));
    });

    it("uses the target name from databaseMapping when provided", async () => {
        const config = buildConfig({
            database: undefined,
            databaseMapping: [
                { originalName: "shop", targetName: "shop_restored", selected: true },
            ],
        });

        const result = await restore(config, "/backups/dump.sql");

        expect(result.success).toBe(true);
        expect(mockEnsureDatabase).toHaveBeenCalledWith(
            config, "shop_restored", "root", "secret", false, expect.any(Array)
        );
    });

    it("falls back to originalName when targetName is empty in mapping", async () => {
        const config = buildConfig({
            database: undefined,
            databaseMapping: [
                { originalName: "shop", targetName: "", selected: true },
            ],
        });

        const result = await restore(config, "/backups/dump.sql");

        expect(result.success).toBe(true);
        expect(mockEnsureDatabase).toHaveBeenCalledWith(
            config, "shop", expect.any(String), expect.any(String), expect.any(Boolean), expect.any(Array)
        );
    });

    // -------------------------------------------------------------------------
    // createStderrHandler behavior (tested via waitForProcess callback)
    // -------------------------------------------------------------------------

    it("forwards stderr lines as log entries", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) onLog("Importing table data\n");
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        expect(result.success).toBe(true);
        expect(result.logs.some((l) => l.includes("Importing table data"))).toBe(true);
    });

    it("filters benign 'Using a password' warnings from stderr", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) onLog("Using a password on the command line interface can be insecure.\n");
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        expect(result.logs.some((l) => l.toLowerCase().includes("using a password"))).toBe(false);
    });

    it("filters 'Deprecated program name' warnings from stderr", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) onLog("Deprecated program name. It will be removed in a future release.\n");
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        expect(result.logs.some((l) => l.toLowerCase().includes("deprecated program name"))).toBe(false);
    });

    it("prefixes ERROR lines and logs them at error level via onLog callback", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) onLog("ERROR 1045 (28000): Access denied for user\n");
            return Promise.resolve();
        });

        const logCalls: { msg: string; level?: string }[] = [];
        await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql", (msg, level) => {
            logCalls.push({ msg, level });
        });

        const errorEntry = logCalls.find((l) => l.msg.includes("ERROR 1045"));
        expect(errorEntry).toBeDefined();
        expect(errorEntry?.level).toBe("error");
    });

    it("truncates stderr lines that exceed 500 characters", async () => {
        const longLine = "x".repeat(600);
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) onLog(`${longLine}\n`);
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        const truncatedEntry = result.logs.find((l) => l.includes("(truncated)"));
        expect(truncatedEntry).toBeDefined();
    });

    it("suppresses stderr lines beyond 50 and logs a suppression summary", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            if (onLog) {
                // Send 55 normal lines to exceed MAX_STDERR_LOG_LINES (50)
                for (let i = 0; i < 55; i++) {
                    onLog(`Warning line ${i}\n`);
                }
            }
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        const suppressEntry = result.logs.find((l) => l.includes("suppressed"));
        expect(suppressEntry).toBeDefined();
        expect(suppressEntry).toMatch(/5 additional stderr line\(s\) suppressed/);
    });

    it("flushes remaining buffered stderr content after process completes", async () => {
        mockWaitForProcess.mockImplementation((_proc, _name, onLog) => {
            // Send text without a trailing newline - will be held in buffer until flush
            if (onLog) onLog("partial-line-no-newline");
            return Promise.resolve();
        });

        const result = await restore(buildConfig({ database: "testdb" }), "/backups/dump.sql");

        expect(result.logs.some((l) => l.includes("partial-line-no-newline"))).toBe(true);
    });
});

// -------------------------------------------------------------------------
// restore() - Multi-DB TAR archive
// -------------------------------------------------------------------------

describe("restore() - Multi-DB TAR archive", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
        mockIsMultiDbTar.mockResolvedValue(true);
        mockEnsureDatabase.mockResolvedValue(undefined);
        mockCleanupTempDir.mockResolvedValue(undefined);
        mockFsStat.mockResolvedValue({ size: 1024 });
        mockWaitForProcess.mockResolvedValue(undefined);
        mockCreateReadStream.mockImplementation(() => {
            const stream = new PassThrough();
            process.nextTick(() => stream.end(Buffer.from("sql-content")));
            return stream;
        });
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess());
        mockShouldRestoreDatabase.mockReturnValue(true);
        mockGetTargetDatabaseName.mockImplementation((name: string) => name);
    });

    it("restores all databases from a TAR archive", async () => {
        const tempDir = "/tmp/mysql-restore-test";
        mockCreateTempDir.mockResolvedValue(tempDir);
        mockExtractSelectedDatabases.mockResolvedValue({
            manifest: {
                databases: [
                    { name: "shop", filename: "shop.sql" },
                    { name: "analytics", filename: "analytics.sql" },
                ],
            },
            files: [
                `${tempDir}/shop.sql`,
                `${tempDir}/analytics.sql`,
            ],
        });

        const result = await restore(buildConfig(), "/backups/multi.tar");

        expect(result.success).toBe(true);
        expect(mockEnsureDatabase).toHaveBeenCalledTimes(2);
        expect(result.logs.some((l) => l.includes("shop"))).toBe(true);
        expect(result.logs.some((l) => l.includes("analytics"))).toBe(true);
    });

    it("skips databases that should not be restored according to shouldRestoreDatabase", async () => {
        const tempDir = "/tmp/mysql-restore-skip";
        mockCreateTempDir.mockResolvedValue(tempDir);
        mockExtractSelectedDatabases.mockResolvedValue({
            manifest: {
                databases: [
                    { name: "shop", filename: "shop.sql" },
                    { name: "skip_me", filename: "skip_me.sql" },
                ],
            },
            files: [`${tempDir}/shop.sql`, `${tempDir}/skip_me.sql`],
        });
        mockShouldRestoreDatabase.mockImplementation((name: string) => name === "shop");

        const result = await restore(buildConfig(), "/backups/multi.tar");

        expect(result.success).toBe(true);
        expect(mockEnsureDatabase).toHaveBeenCalledTimes(1);
        // "skip_me" may appear in the manifest summary log, but must not appear in a "Restored" entry
        expect(result.logs.some((l) => l.startsWith("Restored database:") && l.includes("skip_me"))).toBe(false);
    });

    it("cleans up the temp directory even when a restore fails", async () => {
        const tempDir = "/tmp/mysql-restore-fail";
        mockCreateTempDir.mockResolvedValue(tempDir);
        mockExtractSelectedDatabases.mockRejectedValue(new Error("extraction failed"));

        const result = await restore(buildConfig(), "/backups/multi.tar");

        expect(result.success).toBe(false);
        expect(mockCleanupTempDir).toHaveBeenCalledWith(tempDir);
    });

    it("returns failure when the database file is missing from the extracted archive", async () => {
        const tempDir = "/tmp/mysql-restore-missing";
        mockCreateTempDir.mockResolvedValue(tempDir);
        mockExtractSelectedDatabases.mockResolvedValue({
            manifest: { databases: [{ name: "shop", filename: "shop.sql" }] },
            files: [], // no files extracted
        });

        const result = await restore(buildConfig(), "/backups/multi.tar");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found in archive/i);
    });
});
