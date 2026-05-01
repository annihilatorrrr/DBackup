import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySQLConfig } from "@/lib/adapters/definitions";

// --- Hoisted mocks ---

const {
    mockGetDatabases,
    mockIsMultiDbTar,
    mockCreateMultiDbTar,
    mockCreateTempDir,
    mockCleanupTempDir,
    mockFsStat,
    mockSpawnProcess,
    mockIsSSHMode,
    PassThrough,
} = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PassThrough } = require("stream") as { PassThrough: typeof import("stream").PassThrough };
    return {
        mockGetDatabases: vi.fn(),
        mockIsMultiDbTar: vi.fn(),
        mockCreateMultiDbTar: vi.fn(),
        mockCreateTempDir: vi.fn(),
        mockCleanupTempDir: vi.fn(),
        mockFsStat: vi.fn(),
        mockSpawnProcess: vi.fn(),
        mockIsSSHMode: vi.fn(),
        PassThrough,
    };
});

vi.mock("@/lib/adapters/database/mysql/connection", () => ({
    getDatabases: (...args: any[]) => mockGetDatabases(...args),
    execFileAsync: vi.fn(),
}));

vi.mock("@/lib/adapters/database/mysql/tools", () => ({
    getMysqldumpCommand: vi.fn(() => "mysqldump"),
    getMysqlCommand: vi.fn(() => "mysql"),
    getMysqladminCommand: vi.fn(() => "mysqladmin"),
    initMysqlTools: vi.fn(),
}));

vi.mock("@/lib/adapters/database/mysql/dialects", () => ({
    getDialect: vi.fn(() => ({
        getDumpArgs: vi.fn((_cfg: any, dbs: string[]) => [
            "--host=localhost",
            "--user=root",
            "--databases",
            ...dbs,
        ]),
        getRestoreArgs: vi.fn(),
    })),
}));

vi.mock("@/lib/adapters/database/common/tar-utils", () => ({
    isMultiDbTar: (...args: any[]) => mockIsMultiDbTar(...args),
    createMultiDbTar: (...args: any[]) => mockCreateMultiDbTar(...args),
    createTempDir: (...args: any[]) => mockCreateTempDir(...args),
    cleanupTempDir: (...args: any[]) => mockCleanupTempDir(...args),
}));

vi.mock("child_process", () => ({
    spawn: (...args: any[]) => mockSpawnProcess(...args),
    default: { spawn: (...args: any[]) => mockSpawnProcess(...args) },
}));

vi.mock("@/lib/ssh", () => ({
    SshClient: class {
        connect = vi.fn();
        exec = vi.fn();
        execStream = vi.fn();
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

vi.mock("fs", () => {
    const createWriteStream = vi.fn(() => {
        const stream = new PassThrough() as any;
        stream.on("pipe", () => { process.nextTick(() => stream.emit("finish")); });
        return stream;
    });
    return {
        default: { createWriteStream },
        createWriteStream,
    };
});

import { dump } from "@/lib/adapters/database/mysql/dump";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildConfig(overrides: Partial<MySQLConfig & { type?: string; detectedVersion?: string }> = {}): MySQLConfig & { type?: string; detectedVersion?: string } {
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

/** Creates a mock spawn process that emits 'close' with the given exit code. */
function makeSpawnProcess(exitCode = 0, stderrData?: string) {
    const proc = new PassThrough() as any;
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.kill = vi.fn();
    process.nextTick(() => {
        if (stderrData) proc.stderr.emit("data", Buffer.from(stderrData));
        proc.emit("close", exitCode);
    });
    return proc;
}

describe("MySQL Dump - dump()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
        mockFsStat.mockResolvedValue({ size: 1024 * 100 });
        mockCleanupTempDir.mockResolvedValue(undefined);
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(0));
    });

    // -------------------------------------------------------------------------
    // Single-database dumps
    // -------------------------------------------------------------------------

    it("dumps a single database and returns success", async () => {
        const result = await dump(buildConfig({ database: "mydb" }), "/tmp/mydb.sql");

        expect(result.success).toBe(true);
        expect(result.size).toBe(1024 * 100);
        expect(mockSpawnProcess).toHaveBeenCalledWith(
            "mysqldump",
            expect.arrayContaining(["mydb"]),
            expect.any(Object)
        );
    });

    it("uses mysqldump command from tools module", async () => {
        await dump(buildConfig({ database: "mydb" }), "/tmp/output.sql");

        expect(mockSpawnProcess).toHaveBeenCalledWith("mysqldump", expect.any(Array), expect.any(Object));
    });

    it("returns failure when dump file is empty after process exit", async () => {
        mockFsStat.mockResolvedValue({ size: 0 });
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(0));

        const result = await dump(buildConfig({ database: "mydb" }), "/tmp/mydb.sql");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/empty/i);
    });

    it("returns failure when mysqldump exits with non-zero code", async () => {
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(1));

        const result = await dump(buildConfig({ database: "mydb" }), "/tmp/mydb.sql");

        expect(result.success).toBe(false);
    });

    it("forwards non-filtered stderr messages to the log", async () => {
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(0, "Table does not support optimize.\n"));
        const logs: string[] = [];

        const result = await dump(buildConfig({ database: "mydb" }), "/tmp/mydb.sql", (msg) => {
            logs.push(msg);
        });

        expect(result.success).toBe(true);
        expect(logs.some((l) => l.includes("Table does not support"))).toBe(true);
    });

    it("filters 'Using a password' warnings from stderr output", async () => {
        mockSpawnProcess.mockImplementation(() =>
            makeSpawnProcess(0, "Using a password on the command line interface can be insecure.\n")
        );
        const logs: string[] = [];

        await dump(buildConfig({ database: "mydb" }), "/tmp/mydb.sql", (msg) => {
            logs.push(msg);
        });

        expect(logs.some((l) => l.toLowerCase().includes("using a password"))).toBe(false);
    });

    // -------------------------------------------------------------------------
    // Database discovery when no database specified
    // -------------------------------------------------------------------------

    it("discovers databases via getDatabases when none specified in config", async () => {
        mockGetDatabases.mockResolvedValue(["discovered_db"]);

        const result = await dump(buildConfig({ database: undefined as any }), "/tmp/out.sql");

        expect(mockGetDatabases).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it("returns failure when no databases exist on the server", async () => {
        mockGetDatabases.mockResolvedValue([]);

        const result = await dump(buildConfig({ database: undefined as any }), "/tmp/out.sql");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No databases found/i);
    });

    it("parses comma-separated database list from config", async () => {
        // Create processes inside mockImplementation so nextTick fires AFTER spawn returns
        // and the 'close' listener is already registered.
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(0));
        mockCreateTempDir.mockResolvedValue("/tmp/mysql-multidb-test");
        mockCreateMultiDbTar.mockResolvedValue({
            databases: [{ name: "db1" }, { name: "db2" }],
        });

        const result = await dump(buildConfig({ database: "db1,db2" }), "/tmp/multi.tar");

        expect(result.success).toBe(true);
        expect(mockCreateMultiDbTar).toHaveBeenCalled();
        expect(mockCleanupTempDir).toHaveBeenCalledWith("/tmp/mysql-multidb-test");
    });

    // -------------------------------------------------------------------------
    // Multi-database TAR archive
    // -------------------------------------------------------------------------

    it("creates a TAR archive for an array of databases", async () => {
        // Create processes inside mockImplementation so nextTick fires AFTER spawn returns.
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(0));
        mockCreateTempDir.mockResolvedValue("/tmp/mysql-multidb-xyz");
        mockCreateMultiDbTar.mockResolvedValue({
            databases: [{ name: "shop" }, { name: "analytics" }],
        });

        const result = await dump(
            buildConfig({ database: ["shop", "analytics"] as any }),
            "/tmp/multi.tar"
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.multiDb?.format).toBe("tar");
        expect(result.metadata?.multiDb?.databases).toEqual(["shop", "analytics"]);
    });

    it("cleans up the temp directory even when a multi-db dump fails", async () => {
        mockCreateTempDir.mockResolvedValue("/tmp/mysql-multidb-fail");
        mockSpawnProcess.mockImplementation(() => makeSpawnProcess(1)); // dump fails

        const result = await dump(
            buildConfig({ database: "db1,db2" }),
            "/tmp/multi.tar"
        );

        expect(result.success).toBe(false);
        expect(mockCleanupTempDir).toHaveBeenCalledWith("/tmp/mysql-multidb-fail");
    });
});
