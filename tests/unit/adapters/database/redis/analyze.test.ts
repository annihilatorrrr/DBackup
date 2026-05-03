import { describe, it, expect } from "vitest";
import { analyzeDump } from "@/lib/adapters/database/redis/analyze";

describe("analyzeDump", () => {
    it("returns an empty array regardless of the source path", async () => {
        const result = await analyzeDump("/tmp/backup.rdb");
        expect(result).toEqual([]);
    });

    it("returns an empty array for an empty string path", async () => {
        const result = await analyzeDump("");
        expect(result).toEqual([]);
    });
});
