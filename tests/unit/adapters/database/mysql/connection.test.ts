import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySQLConfig } from "@/lib/adapters/definitions";

// --- Hoisted mocks ---

const {
    mockExecFileCb,
    mockIsSSHMode,
    mockGetMysqlCommand,
    mockGetMysqladminCommand,
} = vi.hoisted(() => ({
    mockExecFileCb: vi.fn(),
    mockIsSSHMode: vi.fn(),
    mockGetMysqlCommand: vi.fn(() => "mysql"),
    mockGetMysqladminCommand: vi.fn(() => "mysqladmin"),
}));

// connection.ts uses util.promisify(execFile); mock execFile so promisify wraps the mock.
vi.mock("child_process", () => ({
    execFile: mockExecFileCb,
    default: { execFile: mockExecFileCb },
}));

vi.mock("@/lib/ssh", () => ({
    SshClient: class {
        connect = vi.fn();
        exec = vi.fn();
        end = vi.fn();
    },
    isSSHMode: (...args: any[]) => mockIsSSHMode(...args),
    extractSshConfig: vi.fn(),
    buildMysqlArgs: vi.fn(() => []),
    remoteEnv: vi.fn((env: any, cmd: string) => cmd),
    remoteBinaryCheck: vi.fn(),
    shellEscape: vi.fn((s: string) => s),
}));

vi.mock("@/lib/adapters/database/mysql/tools", () => ({
    getMysqlCommand: (...args: any[]) => (mockGetMysqlCommand as (...a: any[]) => any)(...args),
    getMysqladminCommand: (...args: any[]) => (mockGetMysqladminCommand as (...a: any[]) => any)(...args),
    getMysqldumpCommand: vi.fn(() => "mysqldump"),
    initMysqlTools: vi.fn(),
}));

import {
    test,
    getDatabases,
    getDatabasesWithStats,
    ensureDatabase,
} from "@/lib/adapters/database/mysql/connection";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildConfig(overrides: Partial<MySQLConfig> = {}): MySQLConfig {
    return {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "secret",
        database: "testdb",
        disableSsl: false,
        ...overrides,
    } as MySQLConfig;
}

/** Make mockExecFileCb call its last-arg callback successfully with the given stdout. */
function execSucceeds(stdout = "") {
    mockExecFileCb.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
        cb(null, { stdout, stderr: "" });
    });
}

/** Make mockExecFileCb call its last-arg callback with an error. */
function execFails(message = "command failed", stderr = "") {
    mockExecFileCb.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: { message: string; stderr: string }) => void;
        cb({ message, stderr });
    });
}

describe("MySQL Connection - test()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
    });

    it("returns success with a parsed version on ping + version success", async () => {
        mockExecFileCb
            .mockImplementationOnce((...args: unknown[]) => {
                // mysqladmin ping
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "mysqld is alive", stderr: "" });
            })
            .mockImplementationOnce((...args: unknown[]) => {
                // mysql SELECT VERSION()
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "8.0.35-MySQL Community Server\n", stderr: "" });
            });

        const result = await test(buildConfig());

        expect(result.success).toBe(true);
        expect(result.message).toContain("Connection successful");
        expect(result.version).toBe("8.0.35");
    });

    it("strips MariaDB suffix from version string", async () => {
        mockExecFileCb
            .mockImplementationOnce((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "mysqld is alive", stderr: "" });
            })
            .mockImplementationOnce((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "11.4.9-MariaDB-ubu2404\n", stderr: "" });
            });

        const result = await test(buildConfig());

        expect(result.success).toBe(true);
        expect(result.version).toBe("11.4.9");
    });

    it("returns failure when mysqladmin ping fails", async () => {
        mockExecFileCb.mockImplementationOnce((...args: unknown[]) => {
            const cb = args[args.length - 1] as (err: { stderr: string; message: string }) => void;
            cb({ stderr: "Access denied for user", message: "Command failed" });
        });

        const result = await test(buildConfig());

        expect(result.success).toBe(false);
        expect(result.message).toContain("Connection failed");
        expect(result.message).toContain("Access denied");
    });

    it("returns the raw version string when it does not start with digits", async () => {
        mockExecFileCb
            .mockImplementationOnce((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "mysqld is alive", stderr: "" });
            })
            .mockImplementationOnce((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "custom-build\n", stderr: "" });
            });

        const result = await test(buildConfig());

        expect(result.success).toBe(true);
        expect(result.version).toBe("custom-build");
    });

    it("includes --skip-ssl args when disableSsl is true", async () => {
        mockExecFileCb
            .mockImplementationOnce((...args: unknown[]) => {
                const cmdArgs = args[1] as string[];
                expect(cmdArgs).toContain("--skip-ssl");
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "mysqld is alive", stderr: "" });
            })
            .mockImplementationOnce((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: "8.0.35\n", stderr: "" });
            });

        await test(buildConfig({ disableSsl: true }));
    });
});

describe("MySQL Connection - getDatabases()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
    });

    it("returns user databases and filters system databases", async () => {
        execSucceeds("information_schema\nmysql\nperformance_schema\nsys\ntestdb\n");

        const dbs = await getDatabases(buildConfig());

        expect(dbs).toEqual(["testdb"]);
        expect(dbs).not.toContain("information_schema");
        expect(dbs).not.toContain("mysql");
        expect(dbs).not.toContain("performance_schema");
        expect(dbs).not.toContain("sys");
    });

    it("returns multiple user databases", async () => {
        execSucceeds("shop\nanalytics\nblog\n");

        const dbs = await getDatabases(buildConfig());

        expect(dbs).toEqual(["shop", "analytics", "blog"]);
    });

    it("returns an empty array when only system databases exist", async () => {
        execSucceeds("information_schema\nmysql\n");

        const dbs = await getDatabases(buildConfig());

        expect(dbs).toEqual([]);
    });

    it("passes --skip-ssl to the command when disableSsl is true", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const cmdArgs = args[1] as string[];
            expect(cmdArgs).toContain("--skip-ssl");
            const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
            cb(null, { stdout: "mydb\n", stderr: "" });
        });

        const dbs = await getDatabases(buildConfig({ disableSsl: true }));

        expect(dbs).toEqual(["mydb"]);
    });
});

describe("MySQL Connection - getDatabasesWithStats()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
    });

    it("parses tab-separated stats output correctly", async () => {
        execSucceeds("shop\t102400\t12\nanalytics\t512000\t3\n");

        const stats = await getDatabasesWithStats(buildConfig());

        expect(stats).toHaveLength(2);
        expect(stats[0]).toEqual({ name: "shop", sizeInBytes: 102400, tableCount: 12 });
        expect(stats[1]).toEqual({ name: "analytics", sizeInBytes: 512000, tableCount: 3 });
    });

    it("returns an empty array for empty stdout", async () => {
        execSucceeds("");

        const stats = await getDatabasesWithStats(buildConfig());

        expect(stats).toEqual([]);
    });

    it("defaults size and count to 0 for unparseable values", async () => {
        execSucceeds("broken\tNULL\tNULL\n");

        const stats = await getDatabasesWithStats(buildConfig());

        expect(stats[0]).toEqual({ name: "broken", sizeInBytes: 0, tableCount: 0 });
    });

    it("passes --skip-ssl to the command when disableSsl is true", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const cmdArgs = args[1] as string[];
            expect(cmdArgs).toContain("--skip-ssl");
            const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
            cb(null, { stdout: "shop\t1024\t5\n", stderr: "" });
        });

        const stats = await getDatabasesWithStats(buildConfig({ disableSsl: true }));

        expect(stats[0].name).toBe("shop");
    });
});

describe("MySQL Connection - ensureDatabase()", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsSSHMode.mockReturnValue(false);
    });

    it("runs CREATE DATABASE when not privileged", async () => {
        execSucceeds();

        const logs: string[] = [];
        await ensureDatabase(buildConfig(), "newdb", "root", "secret", false, logs);

        expect(logs).toContain("Database 'newdb' ensured.");
        // Only one execFile call (CREATE DATABASE, no GRANT)
        expect(mockExecFileCb).toHaveBeenCalledTimes(1);
    });

    it("runs CREATE DATABASE and GRANT when privileged", async () => {
        execSucceeds();

        const logs: string[] = [];
        await ensureDatabase(buildConfig(), "newdb", "admin", "adminpw", true, logs);

        expect(logs).toContain("Database 'newdb' ensured.");
        expect(logs).toContain("Permissions granted for 'newdb'.");
        // Two execFile calls: CREATE DATABASE + GRANT
        expect(mockExecFileCb).toHaveBeenCalledTimes(2);
    });

    it("pushes a warning to logs when the command fails", async () => {
        execFails("Access denied");

        const logs: string[] = [];
        await ensureDatabase(buildConfig(), "faildb", "root", "secret", false, logs);

        expect(logs.some((l) => l.includes("Warning") && l.includes("faildb"))).toBe(true);
    });
});
