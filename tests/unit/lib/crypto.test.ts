import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// AES-256-GCM requires a 64-char hex key (32 bytes)
const VALID_KEY = "a".repeat(64);

describe("encrypt / decrypt (AES-256-GCM)", () => {
    beforeEach(() => {
        vi.stubEnv("ENCRYPTION_KEY", VALID_KEY);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // Fresh import per test so the module re-reads ENCRYPTION_KEY from env
    async function getCrypto() {
        vi.resetModules();
        return import("@/lib/crypto");
    }

    describe("round-trip correctness", () => {
        it("decrypts to the original plaintext", async () => {
            const { encrypt, decrypt } = await getCrypto();
            const plaintext = "super-secret-password";
            expect(decrypt(encrypt(plaintext))).toBe(plaintext);
        });

        it("round-trips a full JSON credential payload", async () => {
            const { encrypt, decrypt } = await getCrypto();
            const payload = JSON.stringify({
                username: "admin",
                password: "s3cr3t!",
            });
            expect(decrypt(encrypt(payload))).toBe(payload);
        });

        it("produces different ciphertext each call (random IV)", async () => {
            const { encrypt } = await getCrypto();
            const c1 = encrypt("same");
            const c2 = encrypt("same");
            expect(c1).not.toBe(c2);
        });

        it("encodes output as iv:authTag:ciphertext (3 colon-separated hex segments)", async () => {
            const { encrypt } = await getCrypto();
            const parts = encrypt("x").split(":");
            expect(parts).toHaveLength(3);
            // Each segment must be non-empty hex
            for (const p of parts) {
                expect(p).toMatch(/^[0-9a-f]+$/);
            }
        });
    });

    describe("passthrough behaviour", () => {
        it("encrypt returns empty string unchanged", async () => {
            const { encrypt } = await getCrypto();
            expect(encrypt("")).toBe("");
        });

        it("decrypt returns text that does not look encrypted (no 2 colons)", async () => {
            const { decrypt } = await getCrypto();
            expect(decrypt("plain-text")).toBe("plain-text");
        });
    });

    describe("tamper detection", () => {
        it("throws when the auth-tag is corrupted", async () => {
            const { encrypt, decrypt } = await getCrypto();
            const cipher = encrypt("sensitive");
            const parts = cipher.split(":");
            // Flip the first byte of the auth-tag
            const tagBuf = Buffer.from(parts[1], "hex");
            tagBuf[0] ^= 0xff;
            const tampered = `${parts[0]}:${tagBuf.toString("hex")}:${parts[2]}`;
            expect(() => decrypt(tampered)).toThrow();
        });

        it("throws when the ciphertext payload is modified", async () => {
            const { encrypt, decrypt } = await getCrypto();
            const cipher = encrypt("sensitive");
            const parts = cipher.split(":");
            // Flip the first byte of the ciphertext
            const ctBuf = Buffer.from(parts[2], "hex");
            ctBuf[0] ^= 0xff;
            const tampered = `${parts[0]}:${parts[1]}:${ctBuf.toString("hex")}`;
            expect(() => decrypt(tampered)).toThrow();
        });

        it("throws when the IV is replaced", async () => {
            const { encrypt, decrypt } = await getCrypto();
            const cipher = encrypt("sensitive");
            const parts = cipher.split(":");
            // Replace IV with all-zero bytes of same length
            const zeroIv = "0".repeat(parts[0].length);
            const tampered = `${zeroIv}:${parts[1]}:${parts[2]}`;
            expect(() => decrypt(tampered)).toThrow();
        });
    });

    describe("key validation", () => {
        it("throws EncryptionError when ENCRYPTION_KEY is not set", async () => {
            vi.stubEnv("ENCRYPTION_KEY", "");
            const { encrypt } = await getCrypto();
            expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY environment variable is not set");
        });

        it("throws EncryptionError when ENCRYPTION_KEY is too short", async () => {
            vi.stubEnv("ENCRYPTION_KEY", "deadbeef");
            const { encrypt } = await getCrypto();
            expect(() => encrypt("x")).toThrow("64-character hex string");
        });

        it("throws EncryptionError when ENCRYPTION_KEY is too long", async () => {
            vi.stubEnv("ENCRYPTION_KEY", "a".repeat(128));
            const { encrypt } = await getCrypto();
            expect(() => encrypt("x")).toThrow("64-character hex string");
        });
    });

    describe("cross-key isolation", () => {
        it("decrypt throws when the key changes after encryption", async () => {
            const { encrypt } = await getCrypto();
            const cipher = encrypt("secret");

            // Switch to a different valid key
            vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
            const { decrypt } = await getCrypto();
            expect(() => decrypt(cipher)).toThrow();
        });
    });
});
