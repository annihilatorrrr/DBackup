import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
// execFile uses callbacks; promisify picks up the mock because vi.mock is hoisted before module import.

const { mockExecFileCb } = vi.hoisted(() => ({
    mockExecFileCb: vi.fn(),
}));

vi.mock("child_process", () => ({
    execFile: mockExecFileCb,
    default: { execFile: mockExecFileCb },
}));

// tools.ts has module-level cache (cachedMysqlCmd etc.). Reset the module between tests so
// each test starts with a clean slate.
describe("MySQL Tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    // -------------------------------------------------------------------------
    // Pre-init fallback values
    // -------------------------------------------------------------------------

    it("getMysqlCommand returns 'mysql' before initialisation", async () => {
        const { getMysqlCommand } = await import("@/lib/adapters/database/mysql/tools");
        expect(getMysqlCommand()).toBe("mysql");
    });

    it("getMysqldumpCommand returns 'mysqldump' before initialisation", async () => {
        const { getMysqldumpCommand } = await import("@/lib/adapters/database/mysql/tools");
        expect(getMysqldumpCommand()).toBe("mysqldump");
    });

    it("getMysqladminCommand returns 'mysqladmin' before initialisation", async () => {
        const { getMysqladminCommand } = await import("@/lib/adapters/database/mysql/tools");
        expect(getMysqladminCommand()).toBe("mysqladmin");
    });

    // -------------------------------------------------------------------------
    // initMysqlTools: detection logic
    // -------------------------------------------------------------------------

    it("picks the first candidate when which succeeds for it (mariadb family)", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
            cb(null, { stdout: "/usr/bin/mariadb", stderr: "" });
        });

        const { initMysqlTools, getMysqlCommand, getMysqldumpCommand, getMysqladminCommand } =
            await import("@/lib/adapters/database/mysql/tools");

        await initMysqlTools();

        expect(getMysqlCommand()).toBe("mariadb");
        expect(getMysqldumpCommand()).toBe("mariadb-dump");
        expect(getMysqladminCommand()).toBe("mariadb-admin");
    });

    it("falls back to the second candidate when the first which call fails", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const whichTarget = (args[1] as string[])[0];
            const cb = args[args.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void;

            // Reject mariadb / mariadb-dump / mariadb-admin, accept the plain mysql variants
            if (whichTarget === "mariadb" || whichTarget === "mariadb-dump" || whichTarget === "mariadb-admin") {
                cb(new Error("not found"));
            } else {
                cb(null, { stdout: `/usr/bin/${whichTarget}`, stderr: "" });
            }
        });

        const { initMysqlTools, getMysqlCommand, getMysqldumpCommand, getMysqladminCommand } =
            await import("@/lib/adapters/database/mysql/tools");

        await initMysqlTools();

        expect(getMysqlCommand()).toBe("mysql");
        expect(getMysqldumpCommand()).toBe("mysqldump");
        expect(getMysqladminCommand()).toBe("mysqladmin");
    });

    it("falls back to the first candidate when all which calls fail (line 24 path)", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const cb = args[args.length - 1] as (err: Error) => void;
            cb(new Error("not found"));
        });

        const { initMysqlTools, getMysqlCommand, getMysqldumpCommand, getMysqladminCommand } =
            await import("@/lib/adapters/database/mysql/tools");

        await initMysqlTools();

        // First candidate for each family is the mariadb variant
        expect(getMysqlCommand()).toBe("mariadb");
        expect(getMysqldumpCommand()).toBe("mariadb-dump");
        expect(getMysqladminCommand()).toBe("mariadb-admin");
    });

    // -------------------------------------------------------------------------
    // Caching: initMysqlTools must only run detection once
    // -------------------------------------------------------------------------

    it("caches detection results and skips re-detection on subsequent calls", async () => {
        mockExecFileCb.mockImplementation((...args: unknown[]) => {
            const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
            cb(null, { stdout: "/usr/bin/mysql", stderr: "" });
        });

        const { initMysqlTools } = await import("@/lib/adapters/database/mysql/tools");

        await initMysqlTools();
        await initMysqlTools();

        // Only 3 which-calls (one per command family), not 6
        expect(mockExecFileCb).toHaveBeenCalledTimes(3);
    });
});
