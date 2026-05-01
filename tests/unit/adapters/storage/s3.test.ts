import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import {
    S3GenericAdapter,
    S3AWSAdapter,
    S3R2Adapter,
    S3HetznerAdapter,
} from "@/lib/adapters/storage/s3";

// --- Hoisted mocks ---
const { mockSend, mockUploadDone, mockUploadOn } = vi.hoisted(() => ({
    mockSend: vi.fn(),
    mockUploadDone: vi.fn(),
    mockUploadOn: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
    const MockS3Client = vi.fn(function (this: Record<string, unknown>) {
        this.send = mockSend;
    });
    return {
        S3Client: MockS3Client,
        ListObjectsV2Command: vi.fn(function (this: Record<string, unknown>, params: unknown) {
            Object.assign(this, { _type: "list" }, params as object);
        }),
        GetObjectCommand: vi.fn(function (this: Record<string, unknown>, params: unknown) {
            Object.assign(this, { _type: "get" }, params as object);
        }),
        DeleteObjectCommand: vi.fn(function (this: Record<string, unknown>, params: unknown) {
            Object.assign(this, { _type: "delete" }, params as object);
        }),
        PutObjectCommand: vi.fn(function (this: Record<string, unknown>, params: unknown) {
            Object.assign(this, { _type: "put" }, params as object);
        }),
        StorageClass: {},
    };
});

vi.mock("@aws-sdk/lib-storage", () => {
    const MockUpload = vi.fn(function (this: Record<string, unknown>) {
        this.on = mockUploadOn;
        this.done = mockUploadDone;
    });
    return { Upload: MockUpload };
});

vi.mock("fs", () => ({
    createReadStream: vi.fn(() => Readable.from(["data"])),
    createWriteStream: vi.fn(() => ({
        on: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
    })),
    default: {
        createReadStream: vi.fn(() => Readable.from(["data"])),
        createWriteStream: vi.fn(() => ({
            on: vi.fn(),
            end: vi.fn(),
            write: vi.fn(),
        })),
    },
}));

vi.mock("stream/promises", () => ({
    pipeline: vi.fn().mockResolvedValue(undefined),
    default: { pipeline: vi.fn().mockResolvedValue(undefined) },
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

// --- Configs ---
const genericConfig = {
    endpoint: "https://s3.example.com",
    region: "us-east-1",
    bucket: "my-bucket",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    forcePathStyle: false,
    pathPrefix: "",
};

const awsConfig = {
    region: "us-east-1",
    bucket: "aws-bucket",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    storageClass: "STANDARD",
    pathPrefix: "",
};

const r2Config = {
    accountId: "abc123",
    bucket: "r2-bucket",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    jurisdiction: undefined,
    pathPrefix: "",
};

const hetznerConfig = {
    region: "fsn1",
    bucket: "hetzner-bucket",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    pathPrefix: "",
};

const adapters = [
    { name: "S3GenericAdapter", adapter: S3GenericAdapter, config: genericConfig },
    { name: "S3AWSAdapter", adapter: S3AWSAdapter, config: awsConfig },
    { name: "S3R2Adapter", adapter: S3R2Adapter, config: r2Config },
    { name: "S3HetznerAdapter", adapter: S3HetznerAdapter, config: hetznerConfig },
];

// --- Tests for shared S3 logic (run once via Generic, then spot-check variants) ---

describe("S3 Adapters - shared logic via S3GenericAdapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ===== upload() =====

    describe("upload()", () => {
        it("returns true on successful upload", async () => {
            mockUploadDone.mockResolvedValue({});

            const result = await S3GenericAdapter.upload(genericConfig, "/tmp/backup.sql", "Job/backup.sql");

            expect(result).toBe(true);
            expect(mockUploadDone).toHaveBeenCalled();
        });

        it("returns false when Upload throws", async () => {
            mockUploadDone.mockRejectedValue(new Error("Network error"));

            const result = await S3GenericAdapter.upload(genericConfig, "/tmp/backup.sql", "Job/backup.sql");

            expect(result).toBe(false);
        });

        it("calls onProgress via httpUploadProgress event", async () => {
            mockUploadDone.mockResolvedValue({});
            // Capture the httpUploadProgress callback
            let progressCb: ((p: any) => void) | undefined;
            mockUploadOn.mockImplementation((event: string, cb: (p: any) => void) => {
                if (event === "httpUploadProgress") progressCb = cb;
                return { on: mockUploadOn, done: mockUploadDone };
            });

            const onProgress = vi.fn();
            await S3GenericAdapter.upload(genericConfig, "/tmp/file.sql", "Job/file.sql", onProgress);

            progressCb?.({ loaded: 50, total: 100 });
            expect(onProgress).toHaveBeenCalledWith(50);
        });

        it("respects pathPrefix when building S3 key", async () => {
            const { Upload } = await import("@aws-sdk/lib-storage");
            mockUploadDone.mockResolvedValue({});

            const configWithPrefix = { ...genericConfig, pathPrefix: "backups/prod" };
            await S3GenericAdapter.upload(configWithPrefix, "/tmp/backup.sql", "Job/backup.sql");

            const uploadCtor = (Upload as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
            expect(uploadCtor.params.Key).toBe("backups/prod/Job/backup.sql");
        });

        it("calls onLog callback during upload", async () => {
            mockUploadDone.mockResolvedValue({});
            const onLog = vi.fn();

            await S3GenericAdapter.upload(genericConfig, "/tmp/backup.sql", "Job/backup.sql", undefined, onLog);

            expect(onLog).toHaveBeenCalledWith(expect.stringContaining("S3 upload"), "info", "storage");
        });
    });

    // ===== list() =====

    describe("list()", () => {
        it("returns mapped file list on success", async () => {
            mockSend.mockResolvedValue({
                Contents: [
                    { Key: "Job/backup.sql", Size: 1024, LastModified: new Date("2026-01-01") },
                    { Key: "Job/backup2.sql", Size: 2048, LastModified: new Date("2026-01-02") },
                ],
            });

            const result = await S3GenericAdapter.list(genericConfig, "Job");

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe("backup.sql");
            expect(result[0].size).toBe(1024);
        });

        it("returns empty array when Contents is undefined", async () => {
            mockSend.mockResolvedValue({ Contents: undefined });

            const result = await S3GenericAdapter.list(genericConfig, "Job");

            expect(result).toEqual([]);
        });

        it("returns empty array on ListObjects error", async () => {
            mockSend.mockRejectedValue(new Error("Access Denied"));

            const result = await S3GenericAdapter.list(genericConfig, "Job");

            expect(result).toEqual([]);
        });

        it("filters out zero-size entries (virtual folder markers)", async () => {
            mockSend.mockResolvedValue({
                Contents: [
                    { Key: "Job/", Size: 0, LastModified: new Date() },
                    { Key: "Job/backup.sql", Size: 512, LastModified: new Date() },
                ],
            });

            const result = await S3GenericAdapter.list(genericConfig, "Job");

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("backup.sql");
        });
    });

    // ===== download() =====

    describe("download()", () => {
        it("returns true on successful download", async () => {
            const bodyStream = Readable.from(["data"]);
            (bodyStream as any).transformToString = vi.fn();
            mockSend.mockResolvedValue({ Body: bodyStream, ContentLength: 4 });

            const result = await S3GenericAdapter.download(genericConfig, "Job/backup.sql", "/tmp/out.sql");

            expect(result).toBe(true);
        });

        it("returns false when GetObject throws", async () => {
            mockSend.mockRejectedValue(new Error("NoSuchKey"));

            const result = await S3GenericAdapter.download(genericConfig, "Job/missing.sql", "/tmp/out.sql");

            expect(result).toBe(false);
        });

        it("returns false when Body is empty", async () => {
            mockSend.mockResolvedValue({ Body: null, ContentLength: 0 });

            const result = await S3GenericAdapter.download(genericConfig, "Job/backup.sql", "/tmp/out.sql");

            expect(result).toBe(false);
        });
    });

    // ===== delete() =====

    describe("delete()", () => {
        it("returns true on successful delete", async () => {
            mockSend.mockResolvedValue({});

            const result = await S3GenericAdapter.delete(genericConfig, "Job/backup.sql");

            expect(result).toBe(true);
        });

        it("returns false when DeleteObject throws", async () => {
            mockSend.mockRejectedValue(new Error("Access Denied"));

            const result = await S3GenericAdapter.delete(genericConfig, "Job/backup.sql");

            expect(result).toBe(false);
        });
    });

    // ===== test() =====

    describe("test()", () => {
        it("returns success when put+delete succeed", async () => {
            mockSend.mockResolvedValue({});

            const result = await S3GenericAdapter.test!(genericConfig);

            expect(result.success).toBe(true);
            expect(result.message).toContain("successful");
        });

        it("returns failure message when connection fails", async () => {
            mockSend.mockRejectedValue(new Error("InvalidAccessKeyId"));

            const result = await S3GenericAdapter.test!(genericConfig);

            expect(result.success).toBe(false);
            expect(result.message).toContain("InvalidAccessKeyId");
        });
    });

    // ===== read() =====

    describe("read()", () => {
        it("returns file content as string", async () => {
            const bodyMock = { transformToString: vi.fn().mockResolvedValue('{"checksum":"abc"}') };
            mockSend.mockResolvedValue({ Body: bodyMock });

            const result = await S3GenericAdapter.read!(genericConfig, "Job/backup.sql.meta.json");

            expect(result).toBe('{"checksum":"abc"}');
        });

        it("returns null when file not found", async () => {
            mockSend.mockRejectedValue(new Error("NoSuchKey"));

            const result = await S3GenericAdapter.read!(genericConfig, "Job/missing.meta.json");

            expect(result).toBeNull();
        });

        it("returns null when Body is absent", async () => {
            mockSend.mockResolvedValue({ Body: null });

            const result = await S3GenericAdapter.read!(genericConfig, "Job/missing.meta.json");

            expect(result).toBeNull();
        });
    });
});

// --- Variant-specific tests ---

describe("S3 Adapter variants - configuration wiring", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("S3AWSAdapter - upload succeeds (no endpoint)", async () => {
        mockUploadDone.mockResolvedValue({});
        const result = await S3AWSAdapter.upload(awsConfig, "/tmp/file.sql", "Job/file.sql");
        expect(result).toBe(true);
    });

    it("S3AWSAdapter - storageClass passed to Upload params", async () => {
        const { Upload } = await import("@aws-sdk/lib-storage");
        mockUploadDone.mockResolvedValue({});

        await S3AWSAdapter.upload(awsConfig, "/tmp/file.sql", "Job/file.sql");

        const uploadParams = (Upload as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0].params;
        expect(uploadParams.StorageClass).toBe("STANDARD");
    });

    it("S3R2Adapter - standard endpoint from accountId", async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        mockSend.mockResolvedValue({});

        await S3R2Adapter.test!(r2Config);

        const s3ClientConfig = (S3Client as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
        expect(s3ClientConfig.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
    });

    it("S3R2Adapter - EU jurisdiction endpoint", async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        mockSend.mockResolvedValue({});

        await S3R2Adapter.test!({ ...r2Config, jurisdiction: "eu" });

        const s3ClientConfig = (S3Client as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
        expect(s3ClientConfig.endpoint).toBe("https://abc123.eu.r2.cloudflarestorage.com");
    });

    it("S3HetznerAdapter - Hetzner endpoint from region", async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        mockSend.mockResolvedValue({});

        await S3HetznerAdapter.test!(hetznerConfig);

        const s3ClientConfig = (S3Client as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
        expect(s3ClientConfig.endpoint).toBe("https://fsn1.your-objectstorage.com");
    });

    it("all adapters expose required StorageAdapter interface methods", () => {
        for (const { name, adapter } of adapters) {
            expect(typeof adapter.upload, `${name}.upload`).toBe("function");
            expect(typeof adapter.download, `${name}.download`).toBe("function");
            expect(typeof adapter.list, `${name}.list`).toBe("function");
            expect(typeof adapter.delete, `${name}.delete`).toBe("function");
            expect(typeof adapter.test, `${name}.test`).toBe("function");
            expect(typeof adapter.read, `${name}.read`).toBe("function");
        }
    });
});
