import { describe, it, expect, vi, beforeEach } from "vitest";
import { SFTPAdapter } from "@/lib/adapters/storage/sftp";

// --- Hoisted mocks ---
const { mockSftpConnect, mockSftpEnd, mockSftpPut, mockSftpGet, mockSftpFastGet, mockSftpList, mockSftpExists, mockSftpMkdir, mockSftpDelete, mockSftpStat, mockFsStat } = vi.hoisted(() => ({
    mockSftpConnect: vi.fn(),
    mockSftpEnd: vi.fn().mockResolvedValue(undefined),
    mockSftpPut: vi.fn().mockResolvedValue(undefined),
    mockSftpGet: vi.fn().mockResolvedValue(undefined),
    mockSftpFastGet: vi.fn().mockResolvedValue(undefined),
    mockSftpList: vi.fn(),
    mockSftpExists: vi.fn(),
    mockSftpMkdir: vi.fn().mockResolvedValue(undefined),
    mockSftpDelete: vi.fn().mockResolvedValue(undefined),
    mockSftpStat: vi.fn(),
    mockFsStat: vi.fn().mockResolvedValue({ size: 1024 }),
}));

vi.mock("ssh2-sftp-client", () => {
    class MockSFTPClient {
        connect = mockSftpConnect;
        end = mockSftpEnd;
        put = mockSftpPut;
        get = mockSftpGet;
        fastGet = mockSftpFastGet;
        list = mockSftpList;
        exists = mockSftpExists;
        mkdir = mockSftpMkdir;
        delete = mockSftpDelete;
        stat = mockSftpStat;
    }
    return { default: MockSFTPClient };
});

vi.mock("fs", () => ({
    createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    default: {
        createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    },
    promises: {
        stat: mockFsStat,
    },
}));

vi.mock("@/lib/logging/logger", () => ({
    logger: {
        child: vi.fn().mockReturnValue({
            info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(),
        }),
    },
}));

vi.mock("@/lib/logging/errors", () => ({
    wrapError: vi.fn((e) => e),
}));

// --- Base config ---
const config = {
    host: "sftp.example.com",
    port: 22,
    username: "backupuser",
    password: "secret",
    pathPrefix: "/backups",
};

describe("SFTPAdapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSftpConnect.mockResolvedValue(undefined);
        mockSftpEnd.mockResolvedValue(undefined);
        mockSftpPut.mockResolvedValue(undefined);
        mockSftpDelete.mockResolvedValue(undefined);
        mockSftpMkdir.mockResolvedValue(undefined);
        mockSftpExists.mockResolvedValue("d");
        mockFsStat.mockResolvedValue({ size: 1024 });
    });

    // ===== upload() =====

    describe("upload()", () => {
        it("returns true on successful upload", async () => {
            mockSftpExists.mockResolvedValue("d"); // dir exists
            mockSftpPut.mockResolvedValue(undefined);

            const result = await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql");

            expect(result).toBe(true);
            expect(mockSftpPut).toHaveBeenCalled();
            expect(mockSftpEnd).toHaveBeenCalled();
        });

        it("creates remote directory when it does not exist", async () => {
            mockSftpExists.mockResolvedValue(false); // dir missing
            mockSftpMkdir.mockResolvedValue(undefined);
            mockSftpPut.mockResolvedValue(undefined);

            await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql");

            expect(mockSftpMkdir).toHaveBeenCalled();
        });

        it("returns false when connection fails", async () => {
            mockSftpConnect.mockRejectedValue(new Error("ECONNREFUSED"));

            const result = await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql");

            expect(result).toBe(false);
        });

        it("returns false when put() throws", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpPut.mockRejectedValue(new Error("Disk full"));

            const result = await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql");

            expect(result).toBe(false);
        });

        it("always calls end() even on failure", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpPut.mockRejectedValue(new Error("Error"));

            await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql");

            expect(mockSftpEnd).toHaveBeenCalled();
        });

        it("logs connection and start messages", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpPut.mockResolvedValue(undefined);
            const onLog = vi.fn();

            await SFTPAdapter.upload(config, "/tmp/backup.sql", "Job/backup.sql", undefined, onLog);

            expect(onLog).toHaveBeenCalledWith(expect.stringContaining("sftp.example.com"), "info", "storage");
        });
    });

    // ===== download() =====

    describe("download()", () => {
        it("returns true on successful download (no progress)", async () => {
            mockSftpGet.mockResolvedValue(undefined);

            const result = await SFTPAdapter.download(config, "Job/backup.sql", "/tmp/out.sql");

            expect(result).toBe(true);
            expect(mockSftpGet).toHaveBeenCalled();
        });

        it("returns false when get() throws", async () => {
            mockSftpGet.mockRejectedValue(new Error("No such file"));

            const result = await SFTPAdapter.download(config, "Job/missing.sql", "/tmp/out.sql");

            expect(result).toBe(false);
        });

        it("uses fastGet when onProgress is provided", async () => {
            mockSftpStat.mockResolvedValue({ size: 2048 });
            mockSftpFastGet.mockResolvedValue(undefined);

            const onProgress = vi.fn();
            const result = await SFTPAdapter.download(config, "Job/backup.sql", "/tmp/out.sql", onProgress);

            expect(result).toBe(true);
            expect(mockSftpFastGet).toHaveBeenCalled();
        });
    });

    // ===== list() =====

    describe("list()", () => {
        it("returns files from directory walk", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpList.mockResolvedValue([
                { name: "backup.sql", type: "-", size: 1024, modifyTime: Date.now() },
            ]);

            const result = await SFTPAdapter.list(config, "Job");

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("backup.sql");
        });

        it("returns empty array when directory does not exist", async () => {
            mockSftpExists.mockResolvedValue(false);

            const result = await SFTPAdapter.list(config, "NonExistent");

            expect(result).toEqual([]);
        });

        it("returns empty array on connection error", async () => {
            mockSftpConnect.mockRejectedValue(new Error("Auth failed"));

            const result = await SFTPAdapter.list(config, "Job");

            expect(result).toEqual([]);
        });

        it("recurses into subdirectories", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpList
                .mockResolvedValueOnce([
                    { name: "subdir", type: "d", size: 0, modifyTime: Date.now() },
                ])
                .mockResolvedValueOnce([
                    { name: "nested.sql", type: "-", size: 512, modifyTime: Date.now() },
                ]);

            const result = await SFTPAdapter.list(config, "Job");

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("nested.sql");
        });

        it("strips pathPrefix from returned paths", async () => {
            mockSftpExists.mockResolvedValue("d");
            mockSftpList.mockResolvedValue([
                { name: "backup.sql", type: "-", size: 100, modifyTime: Date.now() },
            ]);

            const result = await SFTPAdapter.list(config, "Job");

            // path should be relative to pathPrefix, not including /backups
            expect(result[0].path).not.toContain("/backups");
        });
    });

    // ===== delete() =====

    describe("delete()", () => {
        it("returns true on successful delete", async () => {
            mockSftpDelete.mockResolvedValue(undefined);

            const result = await SFTPAdapter.delete(config, "Job/backup.sql");

            expect(result).toBe(true);
        });

        it("returns false when delete() throws", async () => {
            mockSftpDelete.mockRejectedValue(new Error("Permission denied"));

            const result = await SFTPAdapter.delete(config, "Job/backup.sql");

            expect(result).toBe(false);
        });
    });

    // ===== test() =====

    describe("test()", () => {
        it("returns success when connect succeeds", async () => {
            const result = await SFTPAdapter.test!(config);

            expect(result.success).toBe(true);
            expect(mockSftpEnd).toHaveBeenCalled();
        });

        it("returns failure when connection throws", async () => {
            mockSftpConnect.mockRejectedValue(new Error("Host unreachable"));

            const result = await SFTPAdapter.test!(config);

            expect(result.success).toBe(false);
            expect(result.message).toContain("Host unreachable");
        });
    });
});
