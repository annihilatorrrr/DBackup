import { describe, it, expect } from "vitest";
import { MongoDBBaseDialect } from "@/lib/adapters/database/mongodb/dialects/mongodb-base";
import { getDialect } from "@/lib/adapters/database/mongodb/dialects";
import { MongoDBConfig } from "@/lib/adapters/definitions";

function buildConfig(overrides: Partial<MongoDBConfig> = {}): MongoDBConfig {
    return {
        host: "localhost",
        port: 27017,
        database: "testdb",
        ...overrides,
    };
}

describe("MongoDBBaseDialect", () => {
    const dialect = new MongoDBBaseDialect();

    describe("supportsVersion()", () => {
        it("returns true for any version string", () => {
            expect(dialect.supportsVersion("7.0.5")).toBe(true);
            expect(dialect.supportsVersion("4.4.0")).toBe(true);
            expect(dialect.supportsVersion("6.0.0-rc1")).toBe(true);
        });
    });

    describe("getDumpArgs()", () => {
        it("uses --uri when provided", () => {
            const args = dialect.getDumpArgs(
                buildConfig({ uri: "mongodb://user:pass@host:27017/" }),
                []
            );
            expect(args).toContain("--uri=mongodb://user:pass@host:27017/");
            expect(args).not.toContain("--host");
        });

        it("uses host/port when no uri", () => {
            const args = dialect.getDumpArgs(buildConfig(), []);
            expect(args).toContain("--host");
            expect(args).toContain("localhost");
            expect(args).toContain("--port");
            expect(args).toContain("27017");
        });

        it("includes auth args with default authenticationDatabase", () => {
            const args = dialect.getDumpArgs(
                buildConfig({ user: "admin", password: "secret" }),
                []
            );
            expect(args).toContain("--username");
            expect(args).toContain("admin");
            expect(args).toContain("--password");
            expect(args).toContain("secret");
            expect(args).toContain("--authenticationDatabase");
            expect(args).toContain("admin");
        });

        it("includes custom authenticationDatabase", () => {
            const args = dialect.getDumpArgs(
                buildConfig({ user: "admin", password: "secret", authenticationDatabase: "myauthdb" }),
                []
            );
            expect(args).toContain("myauthdb");
        });

        it("does not include auth args when user is not set", () => {
            const args = dialect.getDumpArgs(buildConfig({ user: undefined, password: undefined }), []);
            expect(args).not.toContain("--username");
            expect(args).not.toContain("--password");
        });

        it("adds --db arg for single database", () => {
            const args = dialect.getDumpArgs(buildConfig(), ["mydb"]);
            expect(args).toContain("--db");
            expect(args).toContain("mydb");
        });

        it("does not add --db for multiple databases", () => {
            const args = dialect.getDumpArgs(buildConfig(), ["db1", "db2"]);
            expect(args).not.toContain("--db");
        });

        it("always includes --archive and --gzip", () => {
            const args = dialect.getDumpArgs(buildConfig(), []);
            expect(args).toContain("--archive");
            expect(args).toContain("--gzip");
        });

        it("parses quoted options correctly", () => {
            const args = dialect.getDumpArgs(
                buildConfig({ options: '"--ssl" \'--tlsInsecure\'' }),
                []
            );
            expect(args).toContain("--ssl");
            expect(args).toContain("--tlsInsecure");
        });

        it("parses unquoted options", () => {
            const args = dialect.getDumpArgs(
                buildConfig({ options: "--ssl --sslCAFile /certs/ca.pem" }),
                []
            );
            expect(args).toContain("--ssl");
            expect(args).toContain("--sslCAFile");
            expect(args).toContain("/certs/ca.pem");
        });
    });

    describe("getRestoreArgs()", () => {
        it("returns empty array (mongorestore args are built in restore.ts directly)", () => {
            const args = dialect.getRestoreArgs(buildConfig(), "mydb");
            expect(args).toEqual([]);
        });
    });

    describe("getConnectionArgs()", () => {
        it("uses uri when provided", () => {
            const args = dialect.getConnectionArgs(buildConfig({ uri: "mongodb://host/db" }));
            expect(args).toContain("mongodb://host/db");
        });

        it("uses host/port without uri", () => {
            const args = dialect.getConnectionArgs(buildConfig());
            expect(args).toContain("--host");
            expect(args).toContain("localhost");
            expect(args).toContain("--port");
            expect(args).toContain("27017");
        });

        it("includes auth args when user and password set", () => {
            const args = dialect.getConnectionArgs(
                buildConfig({ user: "admin", password: "secret", authenticationDatabase: "admin" })
            );
            expect(args).toContain("--username");
            expect(args).toContain("admin");
            expect(args).toContain("--password");
            expect(args).toContain("secret");
            expect(args).toContain("--authenticationDatabase");
            expect(args).toContain("admin");
        });

        it("uses default authenticationDatabase when not set", () => {
            const args = dialect.getConnectionArgs(
                buildConfig({ user: "admin", password: "secret", authenticationDatabase: undefined })
            );
            expect(args).toContain("--authenticationDatabase");
            expect(args).toContain("admin");
        });

        it("does not include auth args when no user", () => {
            const args = dialect.getConnectionArgs(buildConfig({ user: undefined, password: undefined }));
            expect(args).not.toContain("--username");
        });
    });

    it("getDumpArgs() handles options with no regex matches (empty options)", () => {
        // options string with only whitespace should result in no extra args
        const baseArgs = dialect.getDumpArgs(buildConfig({ options: "" }), []);
        const noOptArgs = dialect.getDumpArgs(buildConfig(), []);
        // Both should have the same args since empty options is falsy
        expect(baseArgs).toEqual(noOptArgs);
    });
});

describe("MongoDB dialects index - getDialect()", () => {
    it("returns a MongoDBBaseDialect instance", () => {
        const dialect = getDialect("mongodb");
        expect(dialect).toBeInstanceOf(MongoDBBaseDialect);
    });

    it("returns dialect regardless of version parameter", () => {
        const dialect = getDialect("mongodb", "6.0.0");
        expect(dialect).toBeInstanceOf(MongoDBBaseDialect);
    });
});
