import { describe, it, expect, vi } from "vitest";

const {
    mockIsMultiDbTar,
    mockReadTarManifest,
} = vi.hoisted(() => ({
    mockIsMultiDbTar: vi.fn(),
    mockReadTarManifest: vi.fn(),
}));

vi.mock("@/lib/adapters/database/common/tar-utils", () => ({
    isMultiDbTar: (...args: any[]) => mockIsMultiDbTar(...args),
    readTarManifest: (...args: any[]) => mockReadTarManifest(...args),
}));

import { analyzeDump } from "@/lib/adapters/database/mongodb/analyze";

describe("analyzeDump", () => {
    it("returns database names from TAR manifest", async () => {
        mockIsMultiDbTar.mockResolvedValue(true);
        mockReadTarManifest.mockResolvedValue({
            databases: [
                { name: "db1", filename: "db1.archive", format: "archive" },
                { name: "db2", filename: "db2.archive", format: "archive" },
            ],
        });

        const result = await analyzeDump("/backups/multi.tar");

        expect(result).toEqual(["db1", "db2"]);
        expect(mockIsMultiDbTar).toHaveBeenCalledWith("/backups/multi.tar");
        expect(mockReadTarManifest).toHaveBeenCalledWith("/backups/multi.tar");
    });

    it("returns empty array when TAR manifest is null", async () => {
        mockIsMultiDbTar.mockResolvedValue(true);
        mockReadTarManifest.mockResolvedValue(null);

        const result = await analyzeDump("/backups/multi.tar");

        expect(result).toEqual([]);
    });

    it("returns empty array for single-database archive (not a TAR)", async () => {
        mockIsMultiDbTar.mockResolvedValue(false);

        const result = await analyzeDump("/backups/single.archive");

        expect(result).toEqual([]);
        expect(mockReadTarManifest).not.toHaveBeenCalled();
    });
});
