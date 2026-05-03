import { describe, it, expect } from "vitest";
import { analyzeDump } from "@/lib/adapters/database/mssql/analyze";

describe("MSSQL analyzeDump", () => {
    it("should return an empty array for a .bak file path", async () => {
        const result = await analyzeDump("/var/opt/mssql/backup/test.bak");
        expect(result).toEqual([]);
    });

    it("should return an empty array regardless of file path", async () => {
        const result = await analyzeDump("");
        expect(result).toEqual([]);
    });
});
