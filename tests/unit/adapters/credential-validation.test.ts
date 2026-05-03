import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateCredentialAssignments } from "@/lib/adapters/credential-validation";
import { ValidationError, NotFoundError } from "@/lib/logging/errors";
import { registerAdapters } from "@/lib/adapters";

vi.mock("@/lib/prisma", () => ({
    default: {
        credentialProfile: {
            findUnique: vi.fn(),
        },
    },
}));

import prisma from "@/lib/prisma";

registerAdapters();

describe("validateCredentialAssignments", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rejects unknown adapter", async () => {
        await expect(
            validateCredentialAssignments("no-such-adapter", null, null)
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("accepts no assignments", async () => {
        await expect(
            validateCredentialAssignments("mysql", null, null)
        ).resolves.toBeUndefined();
    });

    it("rejects primary credential when adapter does not accept one", async () => {
        await expect(
            validateCredentialAssignments("local-filesystem", "cred-1", null)
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rejects ssh credential when adapter does not accept SSH slot", async () => {
        (prisma.credentialProfile.findUnique as any).mockResolvedValue({
            id: "cred-1",
            type: "ACCESS_KEY",
        });
        await expect(
            validateCredentialAssignments("s3-aws", "cred-1", "cred-ssh")
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws NotFoundError when referenced profile does not exist", async () => {
        (prisma.credentialProfile.findUnique as any).mockResolvedValue(null);
        await expect(
            validateCredentialAssignments("mysql", "cred-missing", null)
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects type mismatch (e.g. ACCESS_KEY into a USERNAME_PASSWORD slot)", async () => {
        (prisma.credentialProfile.findUnique as any).mockResolvedValue({
            id: "cred-1",
            type: "ACCESS_KEY",
        });
        await expect(
            validateCredentialAssignments("mysql", "cred-1", null)
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("accepts matching types", async () => {
        (prisma.credentialProfile.findUnique as any)
            .mockResolvedValueOnce({ id: "cred-1", type: "USERNAME_PASSWORD" })
            .mockResolvedValueOnce({ id: "cred-2", type: "SSH_KEY" });
        await expect(
            validateCredentialAssignments("mysql", "cred-1", "cred-2")
        ).resolves.toBeUndefined();
    });
});
