import { describe, it, expect } from "vitest";
import { getDialect } from "@/lib/adapters/database/postgres/dialects/index";
import { PostgresBaseDialect } from "@/lib/adapters/database/postgres/dialects/postgres-base";
import { Postgres14Dialect } from "@/lib/adapters/database/postgres/dialects/postgres-14";
import { Postgres16Dialect } from "@/lib/adapters/database/postgres/dialects/postgres-16";
import { Postgres17Dialect } from "@/lib/adapters/database/postgres/dialects/postgres-17";
import type { PostgresConfig } from "@/lib/adapters/definitions";

const baseConfig: PostgresConfig = {
    host: "localhost",
    port: 5432,
    user: "postgres",
    database: "testdb",
};

// --- getDialect ---

describe("getDialect", () => {
    it("returns PostgresBaseDialect when no version is provided", () => {
        expect(getDialect("postgres")).toBeInstanceOf(PostgresBaseDialect);
    });

    it("returns Postgres17Dialect for '17.' version string", () => {
        expect(getDialect("postgres", "17.1")).toBeInstanceOf(Postgres17Dialect);
    });

    it("returns Postgres17Dialect for 'postgresql 17' version string", () => {
        expect(getDialect("postgres", "PostgreSQL 17.2 on x86_64")).toBeInstanceOf(Postgres17Dialect);
    });

    it("returns Postgres16Dialect for '16.' version string", () => {
        expect(getDialect("postgres", "16.3")).toBeInstanceOf(Postgres16Dialect);
    });

    it("returns Postgres16Dialect for 'postgresql 16' version string", () => {
        expect(getDialect("postgres", "PostgreSQL 16.1 on x86_64")).toBeInstanceOf(Postgres16Dialect);
    });

    it("returns Postgres16Dialect for '15.' version string (compatible)", () => {
        expect(getDialect("postgres", "15.4")).toBeInstanceOf(Postgres16Dialect);
    });

    it("returns Postgres16Dialect for 'postgresql 15' version string", () => {
        expect(getDialect("postgres", "PostgreSQL 15.0")).toBeInstanceOf(Postgres16Dialect);
    });

    it("returns Postgres14Dialect for '14.' version string", () => {
        expect(getDialect("postgres", "14.8")).toBeInstanceOf(Postgres14Dialect);
    });

    it("returns Postgres14Dialect for 'postgresql 14' version string", () => {
        expect(getDialect("postgres", "PostgreSQL 14.0")).toBeInstanceOf(Postgres14Dialect);
    });

    it("returns Postgres14Dialect for '13.' version string", () => {
        expect(getDialect("postgres", "13.11")).toBeInstanceOf(Postgres14Dialect);
    });

    it("returns Postgres14Dialect for '12.' version string", () => {
        expect(getDialect("postgres", "12.15")).toBeInstanceOf(Postgres14Dialect);
    });

    it("returns Postgres14Dialect for 'postgresql 13' version string", () => {
        expect(getDialect("postgres", "PostgreSQL 13.0")).toBeInstanceOf(Postgres14Dialect);
    });

    it("returns Postgres16Dialect as default fallback for unknown version string", () => {
        expect(getDialect("postgres", "something-unknown")).toBeInstanceOf(Postgres16Dialect);
    });
});

// --- PostgresBaseDialect ---

describe("PostgresBaseDialect.supportsVersion", () => {
    const dialect = new PostgresBaseDialect();

    it("always returns true regardless of version", () => {
        expect(dialect.supportsVersion("16.1")).toBe(true);
        expect(dialect.supportsVersion("")).toBe(true);
    });
});

describe("PostgresBaseDialect.getDumpArgs", () => {
    const dialect = new PostgresBaseDialect();

    it("includes host, port, user, format and compression flags", () => {
        const args = dialect.getDumpArgs(baseConfig, ["testdb"]);
        expect(args).toContain("-h");
        expect(args).toContain("localhost");
        expect(args).toContain("-p");
        expect(args).toContain("5432");
        expect(args).toContain("-U");
        expect(args).toContain("postgres");
        expect(args).toContain("-F");
        expect(args).toContain("c");
        expect(args).toContain("-Z");
        expect(args).toContain("6");
    });

    it("adds -d with database name for a single database", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("-d");
        expect(args).toContain("mydb");
    });

    it("uses config.database as fallback when databases array is empty and config.database is a non-empty string", () => {
        const args = dialect.getDumpArgs(baseConfig, []);
        expect(args).toContain("-d");
        expect(args).toContain("testdb");
    });

    it("does not add -d when databases array is empty and config.database is also empty", () => {
        const config: PostgresConfig = { ...baseConfig, database: "" };
        const args = dialect.getDumpArgs(config, []);
        expect(args).not.toContain("-d");
    });

    it("falls back to config.database as connection target when multiple databases are passed", () => {
        // In the TAR path, pg_dump is invoked per-database (length === 1).
        // When length > 1, config.database is used as the connection target if set.
        const args = dialect.getDumpArgs(baseConfig, ["db1", "db2"]);
        expect(args).toContain("-d");
        expect(args).toContain("testdb");
    });

    it("does not add -d when multiple databases are passed and config.database is empty", () => {
        const config: PostgresConfig = { ...baseConfig, database: "" };
        const args = dialect.getDumpArgs(config, ["db1", "db2"]);
        expect(args).not.toContain("-d");
    });

    it("appends plain options when provided", () => {
        const config: PostgresConfig = { ...baseConfig, options: "--verbose --no-comments" };
        const args = dialect.getDumpArgs(config, ["mydb"]);
        expect(args).toContain("--verbose");
        expect(args).toContain("--no-comments");
    });

    it("strips double quotes from quoted options", () => {
        const config: PostgresConfig = { ...baseConfig, options: '"--verbose"' };
        const args = dialect.getDumpArgs(config, ["mydb"]);
        expect(args).toContain("--verbose");
        expect(args).not.toContain('"--verbose"');
    });

    it("strips single quotes from quoted options", () => {
        const config: PostgresConfig = { ...baseConfig, options: "'--verbose'" };
        const args = dialect.getDumpArgs(config, ["mydb"]);
        expect(args).toContain("--verbose");
        expect(args).not.toContain("'--verbose'");
    });

    it("does not add any extra args when options is not set", () => {
        const config: PostgresConfig = { ...baseConfig, options: undefined };
        const args = dialect.getDumpArgs(config, ["mydb"]);
        // Only the base flags + single db flag: 12 entries
        expect(args.length).toBe(12);
    });
});

describe("PostgresBaseDialect.getRestoreArgs", () => {
    const dialect = new PostgresBaseDialect();

    it("returns an empty array (restore args are built in restore.ts)", () => {
        expect(dialect.getRestoreArgs(baseConfig)).toEqual([]);
        expect(dialect.getRestoreArgs(baseConfig, "targetdb")).toEqual([]);
    });
});

describe("PostgresBaseDialect.getConnectionArgs", () => {
    const dialect = new PostgresBaseDialect();

    it("includes host, port and user", () => {
        const args = dialect.getConnectionArgs(baseConfig);
        expect(args).toContain("-h");
        expect(args).toContain("localhost");
        expect(args).toContain("-p");
        expect(args).toContain("5432");
        expect(args).toContain("-U");
        expect(args).toContain("postgres");
    });
});

// --- Postgres14Dialect ---

describe("Postgres14Dialect", () => {
    const dialect = new Postgres14Dialect();

    it("adds --no-sync to dump args", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("--no-sync");
    });

    it("still includes base flags", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("-U");
        expect(args).toContain("postgres");
        expect(args).toContain("-F");
        expect(args).toContain("c");
    });
});

// --- Postgres16Dialect ---

describe("Postgres16Dialect", () => {
    const dialect = new Postgres16Dialect();

    it("adds --no-sync to dump args", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("--no-sync");
    });

    it("still includes base flags", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("-U");
        expect(args).toContain("postgres");
    });
});

// --- Postgres17Dialect ---

describe("Postgres17Dialect", () => {
    const dialect = new Postgres17Dialect();

    it("adds --no-sync to dump args", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("--no-sync");
    });

    it("adds --encoding=UTF8 to dump args", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("--encoding=UTF8");
    });

    it("still includes base flags", () => {
        const args = dialect.getDumpArgs(baseConfig, ["mydb"]);
        expect(args).toContain("-U");
        expect(args).toContain("postgres");
        expect(args).toContain("-F");
        expect(args).toContain("c");
    });
});
