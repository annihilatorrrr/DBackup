import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockPrisma, mockStorageAdapter } = vi.hoisted(() => {
    const mockPrisma = {
        systemSetting: { findUnique: vi.fn() },
        adapterConfig: { findUnique: vi.fn() },
        encryptionProfile: { findUnique: vi.fn() },
    };
    const mockStorageAdapter = {
        upload: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    return { mockPrisma, mockStorageAdapter };
});

vi.mock("@/lib/logging/logger", () => ({
    logger: {
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    },
}));

vi.mock("@/lib/logging/errors", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/logging/errors")>();
    return {
        ...actual,
        wrapError: vi.fn((e) => e),
    };
});

vi.mock("@/lib/prisma", () => ({ default: mockPrisma }));

vi.mock("@/lib/core/registry", () => ({
    registry: { get: vi.fn().mockReturnValue(mockStorageAdapter) },
}));

vi.mock("@/lib/adapters/config-resolver", () => ({
    resolveAdapterConfig: vi.fn().mockResolvedValue({ bucket: "test" }),
}));

vi.mock("@/services/config/config-service", () => ({
    ConfigService: class {
        export() { return Promise.resolve({ jobs: [], sources: [] }); }
    },
}));

vi.mock("@/lib/temp-dir", () => ({
    getTempDir: vi.fn().mockReturnValue("/tmp"),
}));

vi.mock("@/lib/crypto/stream", () => ({
    createEncryptionStream: vi.fn().mockReturnValue({
        stream: new (require("stream").PassThrough)(),
        getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16)),
        iv: Buffer.alloc(12),
    }),
}));

vi.mock("@/services/notifications/system-notification-service", () => ({
    notify: vi.fn().mockResolvedValue(undefined),
}));

// Intercept the pipeline at the promisified wrapper level
vi.mock("@/lib/runner/config-runner", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/runner/config-runner")>();
    return actual;
});

vi.mock("fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("fs")>();
    const { PassThrough } = require("stream");
    return {
        ...actual,
        default: {
            ...actual,
            createWriteStream: vi.fn(() => new PassThrough()),
            promises: {
                stat: vi.fn().mockResolvedValue({ size: 1024 }),
                writeFile: vi.fn().mockResolvedValue(undefined),
                unlink: vi.fn().mockResolvedValue(undefined),
            },
        },
        createWriteStream: vi.fn(() => new PassThrough()),
        promises: {
            stat: vi.fn().mockResolvedValue({ size: 1024 }),
            writeFile: vi.fn().mockResolvedValue(undefined),
            unlink: vi.fn().mockResolvedValue(undefined),
        },
    };
});

// ── Import SUT ─────────────────────────────────────────────────────────────────
import { runConfigBackup } from "@/lib/runner/config-runner";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockSetting(key: string, value: string | null) {
    mockPrisma.systemSetting.findUnique.mockImplementation(
        ({ where }: { where: { key: string } }) => {
            if (where.key === key) return Promise.resolve(value ? { key, value } : null);
            return Promise.resolve(null);
        }
    );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("runConfigBackup - early exits", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns early when config.backup.enabled is not 'true'", async () => {
        mockPrisma.systemSetting.findUnique.mockResolvedValue({ key: "config.backup.enabled", value: "false" });

        await runConfigBackup();

        // Storage should never be touched
        expect(mockStorageAdapter.upload).not.toHaveBeenCalled();
    });

    it("returns early when config.backup.enabled setting is absent", async () => {
        mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

        await runConfigBackup();

        expect(mockStorageAdapter.upload).not.toHaveBeenCalled();
    });

    it("returns early when no storageId is configured", async () => {
        mockPrisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
            if (where.key === "config.backup.enabled") return Promise.resolve({ key: "config.backup.enabled", value: "true" });
            // All others return null including storageId
            return Promise.resolve(null);
        });

        await runConfigBackup();

        expect(mockStorageAdapter.upload).not.toHaveBeenCalled();
    });

    it("throws ConfigurationError when storage adapter config is not found", async () => {
        mockPrisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
            if (where.key === "config.backup.enabled") return Promise.resolve({ key: "config.backup.enabled", value: "true" });
            if (where.key === "config.backup.storageId") return Promise.resolve({ key: "config.backup.storageId", value: "nonexistent-id" });
            return Promise.resolve(null);
        });

        // adapterConfig not found
        mockPrisma.adapterConfig.findUnique.mockResolvedValue(null);

        await expect(runConfigBackup()).rejects.toThrow();
    });

    it("throws ConfigurationError when secrets are included but no encryption profile is set", async () => {
        mockPrisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
            const map: Record<string, string> = {
                "config.backup.enabled": "true",
                "config.backup.storageId": "storage-1",
                "config.backup.includeSecrets": "true",
                // No profileId
            };
            return Promise.resolve(map[where.key] ? { key: where.key, value: map[where.key] } : null);
        });

        mockPrisma.adapterConfig.findUnique.mockResolvedValue({ id: "storage-1", adapterId: "local", name: "Local" });

        await expect(runConfigBackup()).rejects.toThrow();
    });
});

describe("runConfigBackup - retention", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("calls delete for files beyond retention count", async () => {
        // Provide full required settings
        mockPrisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
            const map: Record<string, string> = {
                "config.backup.enabled": "true",
                "config.backup.storageId": "storage-1",
                "config.backup.retention": "2",
            };
            return Promise.resolve(map[where.key] ? { key: where.key, value: map[where.key] } : null);
        });

        mockPrisma.adapterConfig.findUnique.mockResolvedValue({ id: "storage-1", adapterId: "local", name: "Local" });

        // 3 existing backups - oldest should be deleted (keep only 2)
        mockStorageAdapter.list.mockResolvedValue([
            { name: "config-backups/config_backup_2026-01-01T00-00-00Z.json.gz" },
            { name: "config-backups/config_backup_2026-02-01T00-00-00Z.json.gz" },
            { name: "config-backups/config_backup_2026-03-01T00-00-00Z.json.gz" },
        ]);

        await runConfigBackup();

        // At least one delete call for the oldest backup
        expect(mockStorageAdapter.delete).toHaveBeenCalled();
    });

    it("does not delete anything when files are within retention limit", async () => {
        mockPrisma.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
            const map: Record<string, string> = {
                "config.backup.enabled": "true",
                "config.backup.storageId": "storage-1",
                "config.backup.retention": "5",
            };
            return Promise.resolve(map[where.key] ? { key: where.key, value: map[where.key] } : null);
        });

        mockPrisma.adapterConfig.findUnique.mockResolvedValue({ id: "storage-1", adapterId: "local", name: "Local" });

        // Only 2 files, limit is 5 - nothing should be deleted (plus the one just uploaded = 3)
        mockStorageAdapter.list.mockResolvedValue([
            { name: "config-backups/config_backup_2026-01-01T00-00-00Z.json.gz" },
            { name: "config-backups/config_backup_2026-02-01T00-00-00Z.json.gz" },
        ]);

        await runConfigBackup();

        expect(mockStorageAdapter.delete).not.toHaveBeenCalled();
    });
});
