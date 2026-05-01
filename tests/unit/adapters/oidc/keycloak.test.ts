import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KeycloakAdapter } from "@/lib/adapters/oidc/keycloak";

const VALID_OIDC_RESPONSE = {
  issuer: "https://auth.company.com/realms/my-realm",
  authorization_endpoint: "https://auth.company.com/realms/my-realm/protocol/openid-connect/auth",
  token_endpoint: "https://auth.company.com/realms/my-realm/protocol/openid-connect/token",
  userinfo_endpoint: "https://auth.company.com/realms/my-realm/protocol/openid-connect/userinfo",
  jwks_uri: "https://auth.company.com/realms/my-realm/protocol/openid-connect/certs"
};

describe("KeycloakAdapter", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("metadata", () => {
    it("should have correct id", () => {
      expect(KeycloakAdapter.id).toBe("keycloak");
    });

    it("should have correct name", () => {
      expect(KeycloakAdapter.name).toBe("Keycloak");
    });

    it("should expose baseUrl and realm inputs", () => {
      const names = KeycloakAdapter.inputs.map((i) => i.name);
      expect(names).toContain("baseUrl");
      expect(names).toContain("realm");
    });

    it("should mark both inputs as required", () => {
      const required = KeycloakAdapter.inputs.filter((i) => i.required);
      expect(required.map((i) => i.name)).toEqual(expect.arrayContaining(["baseUrl", "realm"]));
    });
  });

  describe("inputSchema", () => {
    it("should accept valid config", () => {
      const result = KeycloakAdapter.inputSchema.safeParse({
        baseUrl: "https://auth.company.com",
        realm: "my-realm"
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-URL baseUrl", () => {
      const result = KeycloakAdapter.inputSchema.safeParse({
        baseUrl: "not-a-url",
        realm: "my-realm"
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty realm", () => {
      const result = KeycloakAdapter.inputSchema.safeParse({
        baseUrl: "https://auth.company.com",
        realm: ""
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing fields", () => {
      const result = KeycloakAdapter.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("getEndpoints", () => {
    it("should construct the correct Keycloak discovery URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await KeycloakAdapter.getEndpoints({
        baseUrl: "https://auth.company.com",
        realm: "my-realm"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.company.com/realms/my-realm/.well-known/openid-configuration",
        expect.any(Object)
      );
    });

    it("should strip trailing slash from baseUrl", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await KeycloakAdapter.getEndpoints({
        baseUrl: "https://auth.company.com/",
        realm: "my-realm"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.company.com/realms/my-realm/.well-known/openid-configuration",
        expect.any(Object)
      );
    });

    it("should send correct Accept and User-Agent headers", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await KeycloakAdapter.getEndpoints({
        baseUrl: "https://auth.company.com",
        realm: "my-realm"
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Accept"]).toBe("application/json");
      expect(options.headers["User-Agent"]).toMatch(/DBackup/);
    });

    it("should return mapped endpoints on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      const endpoints = await KeycloakAdapter.getEndpoints({
        baseUrl: "https://auth.company.com",
        realm: "my-realm"
      });

      expect(endpoints.issuer).toBe(VALID_OIDC_RESPONSE.issuer);
      expect(endpoints.authorizationEndpoint).toBe(VALID_OIDC_RESPONSE.authorization_endpoint);
      expect(endpoints.tokenEndpoint).toBe(VALID_OIDC_RESPONSE.token_endpoint);
      expect(endpoints.userInfoEndpoint).toBe(VALID_OIDC_RESPONSE.userinfo_endpoint);
      expect(endpoints.jwksEndpoint).toBe(VALID_OIDC_RESPONSE.jwks_uri);
      expect(endpoints.discoveryEndpoint).toBe(
        "https://auth.company.com/realms/my-realm/.well-known/openid-configuration"
      );
    });

    it("should throw when discovery returns non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401
      });

      await expect(
        KeycloakAdapter.getEndpoints({
          baseUrl: "https://auth.company.com",
          realm: "my-realm"
        })
      ).rejects.toThrow("401");
    });

    it("should throw when fetch itself rejects", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        KeycloakAdapter.getEndpoints({
          baseUrl: "https://auth.company.com",
          realm: "my-realm"
        })
      ).rejects.toThrow("ECONNREFUSED");
    });
  });
});
