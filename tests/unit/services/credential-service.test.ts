import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    createCredentialProfile,
    listCredentialProfiles,
    getCredentialProfile,
    getDecryptedCredentialData,
    updateCredentialProfile,
    deleteCredentialProfile,
    getReferenceCount,
    getCredentialUsage,
} from "@/services/auth/credential-service";
import prisma from "@/lib/prisma";
import * as cryptoLib from "@/lib/crypto";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/logging/errors";

vi.mock("@/lib/prisma", () => ({
    default: {
        credentialProfile: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        adapterConfig: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/crypto", () => ({
    encrypt: vi.fn(),
    decrypt: vi.fn(),
}));

const baseRow = {
    id: "cred-1",
    name: "Test",
    type: "USERNAME_PASSWORD",
    description: null,
    data: "encrypted",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
};

describe("Credential Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createCredentialProfile", () => {
        it("encrypts payload as JSON-stringified blob and stores it", async () => {
            (cryptoLib.encrypt as any).mockReturnValue("ENCRYPTED");
            (prisma.credentialProfile.findFirst as any).mockResolvedValue(null);
            (prisma.credentialProfile.create as any).mockResolvedValue(baseRow);

            await createCredentialProfile("Test", "USERNAME_PASSWORD", {
                username: "admin",
                password: "secret",
            });

            // Validates and stringifies validated payload before encrypting
            expect(cryptoLib.encrypt).toHaveBeenCalledWith(
                JSON.stringify({ username: "admin", password: "secret" })
            );
            expect(prisma.credentialProfile.create).toHaveBeenCalledWith({
                data: {
                    name: "Test",
                    type: "USERNAME_PASSWORD",
                    data: "ENCRYPTED",
                    description: null,
                },
            });
        });

        it("rejects when name already exists", async () => {
            (prisma.credentialProfile.findFirst as any).mockResolvedValue(baseRow);
            await expect(
                createCredentialProfile("Test", "USERNAME_PASSWORD", {
                    username: "u",
                    password: "p",
                })
            ).rejects.toBeInstanceOf(ConflictError);
        });

        it("rejects invalid payloads with ValidationError", async () => {
            (prisma.credentialProfile.findFirst as any).mockResolvedValue(null);
            await expect(
                createCredentialProfile("Test", "USERNAME_PASSWORD", { username: "u" })
            ).rejects.toBeInstanceOf(ValidationError);
        });

        it("rejects unknown credential types", async () => {
            await expect(
                createCredentialProfile("Test", "BOGUS" as any, {})
            ).rejects.toBeInstanceOf(ValidationError);
        });
    });

    describe("listCredentialProfiles", () => {
        it("returns sanitized list (no data field)", async () => {
            (prisma.credentialProfile.findMany as any).mockResolvedValue([baseRow]);
            const result = await listCredentialProfiles();
            expect(result).toHaveLength(1);
            expect(result[0]).not.toHaveProperty("data");
            expect(result[0].name).toBe("Test");
        });

        it("filters by type when provided", async () => {
            (prisma.credentialProfile.findMany as any).mockResolvedValue([]);
            await listCredentialProfiles("SSH_KEY");
            expect(prisma.credentialProfile.findMany).toHaveBeenCalledWith({
                where: { type: "SSH_KEY" },
                orderBy: { createdAt: "desc" },
            });
        });
    });

    describe("getCredentialProfile", () => {
        it("returns sanitized profile", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            const result = await getCredentialProfile("cred-1");
            expect(result).not.toHaveProperty("data");
            expect(result.id).toBe("cred-1");
        });

        it("throws NotFoundError when missing", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(null);
            await expect(getCredentialProfile("missing")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("getDecryptedCredentialData", () => {
        it("decrypts and parses payload through the typed schema", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (cryptoLib.decrypt as any).mockReturnValue(
                JSON.stringify({ username: "admin", password: "secret" })
            );

            const result = await getDecryptedCredentialData("cred-1");
            expect(result).toEqual({ username: "admin", password: "secret" });
        });

        it("throws when profile missing", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(null);
            await expect(getDecryptedCredentialData("missing")).rejects.toBeInstanceOf(
                NotFoundError
            );
        });
    });

    describe("updateCredentialProfile", () => {
        it("re-validates and re-encrypts data when provided", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.credentialProfile.findFirst as any).mockResolvedValue(null);
            (cryptoLib.encrypt as any).mockReturnValue("NEW_ENCRYPTED");
            (prisma.credentialProfile.update as any).mockResolvedValue(baseRow);

            await updateCredentialProfile("cred-1", {
                data: { username: "alice", password: "newpw" },
            });

            expect(cryptoLib.encrypt).toHaveBeenCalledWith(
                JSON.stringify({ username: "alice", password: "newpw" })
            );
            expect(prisma.credentialProfile.update).toHaveBeenCalledWith({
                where: { id: "cred-1" },
                data: { data: "NEW_ENCRYPTED" },
            });
        });

        it("rejects rename to an existing name", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.credentialProfile.findFirst as any).mockResolvedValue({
                ...baseRow,
                id: "other",
            });

            await expect(
                updateCredentialProfile("cred-1", { name: "Other" })
            ).rejects.toBeInstanceOf(ConflictError);
        });

        it("does not re-validate when data not provided", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.credentialProfile.update as any).mockResolvedValue(baseRow);

            await updateCredentialProfile("cred-1", { description: "updated" });
            expect(cryptoLib.encrypt).not.toHaveBeenCalled();
        });
    });

    describe("getReferenceCount", () => {
        it("sums primary and ssh references", async () => {
            (prisma.adapterConfig.count as any)
                .mockResolvedValueOnce(2)
                .mockResolvedValueOnce(1);

            const count = await getReferenceCount("cred-1");
            expect(count).toBe(3);
        });
    });

    describe("getCredentialUsage", () => {
        it("returns adapters tagged with their slot", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.adapterConfig.findMany as any)
                .mockResolvedValueOnce([
                    { id: "a1", name: "DB1", type: "Source", adapterId: "mysql" },
                ])
                .mockResolvedValueOnce([
                    { id: "a2", name: "DB2", type: "Source", adapterId: "postgres" },
                ]);

            const usage = await getCredentialUsage("cred-1");
            expect(usage).toEqual([
                { adapterId: "a1", name: "DB1", type: "mysql", slot: "primary" },
                { adapterId: "a2", name: "DB2", type: "postgres", slot: "ssh" },
            ]);
        });
    });

    describe("deleteCredentialProfile", () => {
        it("throws ConflictError when references exist", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.adapterConfig.count as any)
                .mockResolvedValueOnce(1)
                .mockResolvedValueOnce(0);

            await expect(deleteCredentialProfile("cred-1")).rejects.toBeInstanceOf(
                ConflictError
            );
            expect(prisma.credentialProfile.delete).not.toHaveBeenCalled();
        });

        it("deletes when no references", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(baseRow);
            (prisma.adapterConfig.count as any).mockResolvedValue(0);
            (prisma.credentialProfile.delete as any).mockResolvedValue(baseRow);

            await deleteCredentialProfile("cred-1");
            expect(prisma.credentialProfile.delete).toHaveBeenCalledWith({
                where: { id: "cred-1" },
            });
        });

        it("throws NotFoundError when missing", async () => {
            (prisma.credentialProfile.findUnique as any).mockResolvedValue(null);
            await expect(deleteCredentialProfile("missing")).rejects.toBeInstanceOf(
                NotFoundError
            );
        });
    });
});
