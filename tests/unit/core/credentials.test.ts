import { describe, it, expect } from "vitest";
import {
    UsernamePasswordSchema,
    SshKeySchema,
    AccessKeySchema,
    TokenSchema,
    SmtpSchema,
    parseCredentialData,
    CREDENTIAL_SCHEMAS,
    CREDENTIAL_TYPES,
} from "@/lib/core/credentials";

describe("Credential Schemas", () => {
    describe("UsernamePasswordSchema", () => {
        it("accepts valid input", () => {
            expect(() =>
                UsernamePasswordSchema.parse({ username: "u", password: "p" })
            ).not.toThrow();
        });
        it("rejects empty username", () => {
            expect(() =>
                UsernamePasswordSchema.parse({ username: "", password: "p" })
            ).toThrow();
        });
        it("rejects empty password", () => {
            expect(() =>
                UsernamePasswordSchema.parse({ username: "u", password: "" })
            ).toThrow();
        });
    });

    describe("SshKeySchema", () => {
        it("accepts password authType with password", () => {
            expect(() =>
                SshKeySchema.parse({
                    username: "root",
                    authType: "password",
                    password: "pw",
                })
            ).not.toThrow();
        });

        it("rejects password authType without password", () => {
            expect(() =>
                SshKeySchema.parse({ username: "root", authType: "password" })
            ).toThrow();
        });

        it("accepts privateKey authType with privateKey", () => {
            expect(() =>
                SshKeySchema.parse({
                    username: "root",
                    authType: "privateKey",
                    privateKey: "-----BEGIN-----...",
                })
            ).not.toThrow();
        });

        it("rejects privateKey authType without privateKey", () => {
            expect(() =>
                SshKeySchema.parse({ username: "root", authType: "privateKey" })
            ).toThrow();
        });

        it("accepts agent authType without secret material", () => {
            expect(() =>
                SshKeySchema.parse({ username: "root", authType: "agent" })
            ).not.toThrow();
        });

        it("rejects unknown authType", () => {
            expect(() =>
                SshKeySchema.parse({
                    username: "root",
                    authType: "magic",
                    password: "x",
                })
            ).toThrow();
        });
    });

    describe("AccessKeySchema", () => {
        it("accepts valid AWS-style keys", () => {
            expect(() =>
                AccessKeySchema.parse({
                    accessKeyId: "AKIA...",
                    secretAccessKey: "secret",
                })
            ).not.toThrow();
        });
        it("rejects missing fields", () => {
            expect(() => AccessKeySchema.parse({ accessKeyId: "x" })).toThrow();
        });
    });

    describe("TokenSchema", () => {
        it("accepts non-empty token", () => {
            expect(() => TokenSchema.parse({ token: "abc" })).not.toThrow();
        });
        it("rejects empty token", () => {
            expect(() => TokenSchema.parse({ token: "" })).toThrow();
        });
    });

    describe("SmtpSchema", () => {
        it("accepts valid SMTP credentials", () => {
            expect(() =>
                SmtpSchema.parse({ user: "noreply", password: "x" })
            ).not.toThrow();
        });
        it("rejects missing user", () => {
            expect(() => SmtpSchema.parse({ password: "x" })).toThrow();
        });
    });

    describe("CREDENTIAL_SCHEMAS map", () => {
        it("has an entry for every CREDENTIAL_TYPES value", () => {
            for (const type of CREDENTIAL_TYPES) {
                expect(CREDENTIAL_SCHEMAS[type]).toBeDefined();
            }
        });
    });

    describe("parseCredentialData", () => {
        it("delegates to the correct schema by type", () => {
            const result = parseCredentialData("USERNAME_PASSWORD", {
                username: "u",
                password: "p",
            });
            expect(result).toEqual({ username: "u", password: "p" });
        });

        it("throws on invalid payload for the given type", () => {
            expect(() =>
                parseCredentialData("USERNAME_PASSWORD", { username: "u" })
            ).toThrow();
        });
    });
});
