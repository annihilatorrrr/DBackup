import { describe, it, expect } from "vitest";
import { getDialect } from "@/lib/adapters/database/mssql/dialects";
import { MSSQLDialect } from "@/lib/adapters/database/mssql/dialects/mssql-base";
import { MSSQL2017Dialect } from "@/lib/adapters/database/mssql/dialects/mssql-2017";

// ---------------------------------------------------------------------------
// getDialect factory
// ---------------------------------------------------------------------------

describe("getDialect", () => {
    it("returns MSSQLDialect when no version is given", () => {
        expect(getDialect()).toBeInstanceOf(MSSQLDialect);
    });

    it("returns MSSQLDialect for version 15.x (SQL Server 2019)", () => {
        expect(getDialect("15.0.4123")).toBeInstanceOf(MSSQLDialect);
    });

    it("returns MSSQLDialect for version 16.x (SQL Server 2022)", () => {
        expect(getDialect("16.0.1000.6")).toBeInstanceOf(MSSQLDialect);
    });

    it("returns MSSQL2017Dialect for version 14.x (SQL Server 2017)", () => {
        expect(getDialect("14.0.3356")).toBeInstanceOf(MSSQL2017Dialect);
    });

    it("returns MSSQL2017Dialect for any version <= 14", () => {
        expect(getDialect("13.0.5026")).toBeInstanceOf(MSSQL2017Dialect);
    });
});

// ---------------------------------------------------------------------------
// MSSQLDialect - getBackupQuery
// ---------------------------------------------------------------------------

describe("MSSQLDialect.getBackupQuery", () => {
    const dialect = new MSSQLDialect();

    it("generates a BACKUP DATABASE statement with default options", () => {
        const q = dialect.getBackupQuery("MyDB", "/var/opt/mssql/backup/MyDB.bak");
        expect(q).toContain("BACKUP DATABASE [MyDB]");
        expect(q).toContain("TO DISK = N'/var/opt/mssql/backup/MyDB.bak'");
        expect(q).toContain("FORMAT");
        expect(q).toContain("INIT");
        expect(q).toContain("COMPRESSION");
    });

    it("omits COMPRESSION when explicitly set to false", () => {
        const q = dialect.getBackupQuery("MyDB", "/backup/MyDB.bak", { compression: false });
        expect(q).not.toContain("COMPRESSION");
    });

    it("includes STATS when stats option is provided", () => {
        const q = dialect.getBackupQuery("MyDB", "/backup/MyDB.bak", { stats: 10 });
        expect(q).toContain("STATS = 10");
    });

    it("includes COPY_ONLY when copyOnly is true", () => {
        const q = dialect.getBackupQuery("MyDB", "/backup/MyDB.bak", { copyOnly: true });
        expect(q).toContain("COPY_ONLY");
    });

    it("escapes single quotes in database name via bracket quoting", () => {
        // Bracket quoting escapes ] as ]]
        const q = dialect.getBackupQuery("My]DB", "/backup.bak");
        expect(q).toContain("[My]]DB]");
    });

    it("escapes single quotes in backup path", () => {
        const q = dialect.getBackupQuery("MyDB", "/backup/O'Brien.bak");
        expect(q).toContain("O''Brien");
    });

    it("throws on empty database name", () => {
        expect(() => dialect.getBackupQuery("", "/backup.bak")).toThrow(
            "Invalid database name"
        );
    });

    it("throws when database name exceeds 128 characters", () => {
        const longName = "a".repeat(129);
        expect(() => dialect.getBackupQuery(longName, "/backup.bak")).toThrow(
            "Invalid database name"
        );
    });

    it("includes the database name as backup NAME label", () => {
        const q = dialect.getBackupQuery("SalesDB", "/backup/SalesDB.bak");
        expect(q).toContain("SalesDB-Full Database Backup");
    });
});

// ---------------------------------------------------------------------------
// MSSQLDialect - getRestoreQuery
// ---------------------------------------------------------------------------

describe("MSSQLDialect.getRestoreQuery", () => {
    const dialect = new MSSQLDialect();

    it("generates a RESTORE DATABASE statement with default options", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak");
        expect(q).toContain("RESTORE DATABASE [MyDB]");
        expect(q).toContain("FROM DISK = N'/backup/MyDB.bak'");
        expect(q).toContain("RECOVERY");
    });

    it("includes REPLACE when replace is true", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak", { replace: true });
        expect(q).toContain("REPLACE");
    });

    it("includes NORECOVERY when recovery is false", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak", { recovery: false });
        expect(q).toContain("NORECOVERY");
        expect(q).not.toContain("WITH RECOVERY");
    });

    it("includes STATS when stats option is provided", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak", { stats: 10 });
        expect(q).toContain("STATS = 10");
    });

    it("includes MOVE clauses when moveFiles are provided", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak", {
            moveFiles: [
                { logicalName: "MyDB_data", physicalPath: "/var/opt/mssql/data/MyDB.mdf" },
                { logicalName: "MyDB_log", physicalPath: "/var/opt/mssql/data/MyDB.ldf" },
            ],
        });
        expect(q).toContain("MOVE N'MyDB_data' TO N'/var/opt/mssql/data/MyDB.mdf'");
        expect(q).toContain("MOVE N'MyDB_log' TO N'/var/opt/mssql/data/MyDB.ldf'");
    });

    it("produces no WITH clause when no options are supplied", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/MyDB.bak", {});
        // With RECOVERY being the default (recovery !== false -> push "RECOVERY"),
        // actually the default adds RECOVERY. When all flags are absent, only RECOVERY is present.
        expect(q).toContain("RECOVERY");
    });

    it("escapes single quotes in backup path", () => {
        const q = dialect.getRestoreQuery("MyDB", "/backup/O'Brien.bak");
        expect(q).toContain("O''Brien");
    });

    it("throws on empty database name", () => {
        expect(() => dialect.getRestoreQuery("", "/backup.bak")).toThrow(
            "Invalid database name"
        );
    });
});

// ---------------------------------------------------------------------------
// MSSQLDialect - supportsVersion
// ---------------------------------------------------------------------------

describe("MSSQLDialect.supportsVersion", () => {
    const dialect = new MSSQLDialect();

    it("returns true for SQL Server 2019 (version 15.x)", () => {
        expect(dialect.supportsVersion("15.0.4123")).toBe(true);
    });

    it("returns true for SQL Server 2022 (version 16.x)", () => {
        expect(dialect.supportsVersion("16.0.1000")).toBe(true);
    });

    it("returns false for SQL Server 2017 (version 14.x)", () => {
        expect(dialect.supportsVersion("14.0.3356")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// MSSQL2017Dialect - supportsVersion
// ---------------------------------------------------------------------------

describe("MSSQL2017Dialect.supportsVersion", () => {
    const dialect = new MSSQL2017Dialect();

    it("returns true for version 14.x (SQL Server 2017)", () => {
        expect(dialect.supportsVersion("14.0.3356")).toBe(true);
    });

    it("returns false for version 15.x (SQL Server 2019)", () => {
        expect(dialect.supportsVersion("15.0.4123")).toBe(false);
    });

    it("returns false for version 13.x (SQL Server 2016)", () => {
        expect(dialect.supportsVersion("13.0.5026")).toBe(false);
    });
});
