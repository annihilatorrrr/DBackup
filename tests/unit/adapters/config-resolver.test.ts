import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import { registry } from "@/lib/core/registry";
import { ConfigurationError, NotFoundError } from "@/lib/errors";

vi.mock("@/services/credential-service", () => ({
    getDecryptedCredentialData: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
    decryptConfig: vi.fn((c: unknown) => c),
}));

import { getDecryptedCredentialData } from "@/services/credential-service";
import { registerAdapters } from "@/lib/adapters";

registerAdapters();

function buildRow(overrides: Partial<{
    adapterId: string;
    config: object;
    primaryCredentialId: string | null;
    sshCredentialId: string | null;
}> = {}) {
    return {
        id: "ac-1",
        adapterId: overrides.adapterId ?? "mysql",
        config: JSON.stringify(overrides.config ?? { host: "db.local", port: 3306 }),
        primaryCredentialId: overrides.primaryCredentialId ?? null,
        sshCredentialId: overrides.sshCredentialId ?? null,
    };
}

describe("resolveAdapterConfig", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws NotFoundError when adapter is unknown", async () => {
        await expect(
            resolveAdapterConfig(buildRow({ adapterId: "no-such-adapter" }))
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns structural config unchanged for adapters without credential requirements", async () => {
        const result = (await resolveAdapterConfig(
            buildRow({ adapterId: "local-filesystem", config: { path: "/tmp" } })
        )) as Record<string, unknown>;

        expect(result).toEqual({ path: "/tmp" });
        expect(getDecryptedCredentialData).not.toHaveBeenCalled();
    });

    it("throws ConfigurationError when primary credential is required but missing", async () => {
        await expect(
            resolveAdapterConfig(
                buildRow({ adapterId: "mysql", primaryCredentialId: null })
            )
        ).rejects.toBeInstanceOf(ConfigurationError);
    });

    it("overlays USERNAME_PASSWORD onto both `user` and `username` fields", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({
            username: "admin",
            password: "secret",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "mysql",
                primaryCredentialId: "cred-1",
                config: { host: "db.local", port: 3306 },
            })
        )) as Record<string, unknown>;

        expect(result.user).toBe("admin");
        expect(result.username).toBe("admin");
        expect(result.password).toBe("secret");
        expect(result.host).toBe("db.local");
    });

    it("overlays SSH slot with `ssh*` prefix when adapter has primary slot", async () => {
        // primary
        (getDecryptedCredentialData as any).mockResolvedValueOnce({
            username: "admin",
            password: "pw",
        });
        // ssh
        (getDecryptedCredentialData as any).mockResolvedValueOnce({
            username: "tunnel",
            authType: "privateKey",
            privateKey: "-----KEY-----",
            passphrase: "ph",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "mysql",
                primaryCredentialId: "cred-primary",
                sshCredentialId: "cred-ssh",
            })
        )) as Record<string, unknown>;

        expect(result.user).toBe("admin");
        expect(result.sshUsername).toBe("tunnel");
        expect(result.sshAuthType).toBe("privateKey");
        expect(result.sshPrivateKey).toBe("-----KEY-----");
        expect(result.sshPassphrase).toBe("ph");
        // Must not clobber primary user with the ssh username
        expect(result.username).toBe("admin");
    });

    it("overlays SSH slot WITHOUT prefix when adapter has no primary slot (SQLite)", async () => {
        (getDecryptedCredentialData as any).mockResolvedValueOnce({
            username: "remoteUser",
            authType: "password",
            password: "remotePw",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "sqlite",
                primaryCredentialId: null,
                sshCredentialId: "cred-ssh",
                config: { mode: "ssh", path: "/db.sqlite", host: "host" },
            })
        )) as Record<string, unknown>;

        expect(result.username).toBe("remoteUser");
        expect(result.password).toBe("remotePw");
        expect(result.authType).toBe("password");
        expect(result.sshUsername).toBeUndefined();
    });

    it("overlays SSH_KEY in primary slot for SFTP-style adapters (no prefix)", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({
            username: "deploy",
            authType: "privateKey",
            privateKey: "KEY",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "sftp",
                primaryCredentialId: "cred-1",
                config: { host: "files.local", port: 22 },
            })
        )) as Record<string, unknown>;

        expect(result.username).toBe("deploy");
        expect(result.authType).toBe("privateKey");
        expect(result.privateKey).toBe("KEY");
    });

    it("overlays ACCESS_KEY for S3-family adapters", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({
            accessKeyId: "AKIA",
            secretAccessKey: "sek",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "s3-aws",
                primaryCredentialId: "cred-1",
                config: { bucket: "b", region: "us-east-1" },
            })
        )) as Record<string, unknown>;

        expect(result.accessKeyId).toBe("AKIA");
        expect(result.secretAccessKey).toBe("sek");
    });

    it("overlays TOKEN for token-based notification adapters", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({ token: "T0KEN" });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "gotify",
                primaryCredentialId: "cred-1",
                config: { url: "https://gotify" },
            })
        )) as Record<string, unknown>;

        expect(result.token).toBe("T0KEN");
    });

    it("overlays SMTP onto `user`/`password` for the email adapter", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({
            user: "noreply",
            password: "smtp-pw",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "email",
                primaryCredentialId: "cred-1",
                config: { host: "smtp.local", port: 587 },
            })
        )) as Record<string, unknown>;

        expect(result.user).toBe("noreply");
        expect(result.password).toBe("smtp-pw");
    });

    it("ignores ssh credential when adapter does not declare an ssh slot", async () => {
        (getDecryptedCredentialData as any).mockResolvedValue({
            accessKeyId: "AKIA",
            secretAccessKey: "sek",
        });

        const result = (await resolveAdapterConfig(
            buildRow({
                adapterId: "s3-aws",
                primaryCredentialId: "cred-primary",
                sshCredentialId: "cred-ssh-ignored",
                config: { bucket: "b" },
            })
        )) as Record<string, unknown>;

        // Only the primary credential was loaded
        expect(getDecryptedCredentialData).toHaveBeenCalledTimes(1);
        expect(result.accessKeyId).toBe("AKIA");
    });
});

describe("Adapter credential declarations", () => {
    it("declares correct primary types for representative adapters", () => {
        expect(registry.get("mysql")?.credentials).toEqual({
            primary: "USERNAME_PASSWORD",
            ssh: "SSH_KEY",
        });
        expect(registry.get("s3-aws")?.credentials).toEqual({ primary: "ACCESS_KEY" });
        expect(registry.get("sftp")?.credentials).toEqual({ primary: "SSH_KEY" });
        expect(registry.get("gotify")?.credentials).toEqual({ primary: "TOKEN" });
        expect(registry.get("email")?.credentials).toEqual({ primary: "SMTP" });
        expect(registry.get("sqlite")?.credentials).toEqual({ ssh: "SSH_KEY" });
        expect(registry.get("local-filesystem")?.credentials).toBeUndefined();
        expect(registry.get("discord")?.credentials).toBeUndefined();
        expect(registry.get("google-drive")?.credentials).toBeUndefined();
    });
});
