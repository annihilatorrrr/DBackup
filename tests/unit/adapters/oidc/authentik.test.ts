import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthentikAdapter } from "@/lib/adapters/oidc/authentik";

const VALID_OIDC_RESPONSE = {
  issuer: "https://auth.company.com/application/o/database-backup/",
  authorization_endpoint: "https://auth.company.com/application/o/authorize/",
  token_endpoint: "https://auth.company.com/application/o/token/",
  userinfo_endpoint: "https://auth.company.com/application/o/userinfo/",
  jwks_uri: "https://auth.company.com/application/o/database-backup/jwks/"
};

describe("AuthentikAdapter", () => {
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
      expect(AuthentikAdapter.id).toBe("authentik");
    });

    it("should have correct name", () => {
      expect(AuthentikAdapter.name).toBe("Authentik");
    });

    it("should expose inputs with baseUrl and slug fields", () => {
      const names = AuthentikAdapter.inputs.map((i) => i.name);
      expect(names).toContain("baseUrl");
      expect(names).toContain("slug");
    });

    it("should mark baseUrl and slug as required", () => {
      const required = AuthentikAdapter.inputs.filter((i) => i.required);
      expect(required.map((i) => i.name)).toEqual(expect.arrayContaining(["baseUrl", "slug"]));
    });
  });

  describe("inputSchema", () => {
    it("should accept valid config", () => {
      const result = AuthentikAdapter.inputSchema.safeParse({
        baseUrl: "https://auth.company.com",
        slug: "database-backup"
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-URL baseUrl", () => {
      const result = AuthentikAdapter.inputSchema.safeParse({
        baseUrl: "not-a-url",
        slug: "database-backup"
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty slug", () => {
      const result = AuthentikAdapter.inputSchema.safeParse({
        baseUrl: "https://auth.company.com",
        slug: ""
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing fields", () => {
      const result = AuthentikAdapter.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("getEndpoints", () => {
    it("should construct the correct Authentik discovery URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await AuthentikAdapter.getEndpoints({
        baseUrl: "https://auth.company.com",
        slug: "database-backup"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.company.com/application/o/database-backup/.well-known/openid-configuration"
      );
    });

    it("should strip trailing slash from baseUrl", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await AuthentikAdapter.getEndpoints({
        baseUrl: "https://auth.company.com/",
        slug: "database-backup"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.company.com/application/o/database-backup/.well-known/openid-configuration"
      );
    });

    it("should return mapped endpoints on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      const endpoints = await AuthentikAdapter.getEndpoints({
        baseUrl: "https://auth.company.com",
        slug: "database-backup"
      });

      expect(endpoints.issuer).toBe(VALID_OIDC_RESPONSE.issuer);
      expect(endpoints.authorizationEndpoint).toBe(VALID_OIDC_RESPONSE.authorization_endpoint);
      expect(endpoints.tokenEndpoint).toBe(VALID_OIDC_RESPONSE.token_endpoint);
      expect(endpoints.userInfoEndpoint).toBe(VALID_OIDC_RESPONSE.userinfo_endpoint);
      expect(endpoints.jwksEndpoint).toBe(VALID_OIDC_RESPONSE.jwks_uri);
      expect(endpoints.discoveryEndpoint).toBe(
        "https://auth.company.com/application/o/database-backup/.well-known/openid-configuration"
      );
    });

    it("should throw when discovery returns non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(
        AuthentikAdapter.getEndpoints({
          baseUrl: "https://auth.company.com",
          slug: "database-backup"
        })
      ).rejects.toThrow("404");
    });

    it("should throw when the response is missing required endpoints", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer: "https://auth.company.com"
          // authorization_endpoint, token_endpoint, userinfo_endpoint missing
        })
      });

      await expect(
        AuthentikAdapter.getEndpoints({
          baseUrl: "https://auth.company.com",
          slug: "database-backup"
        })
      ).rejects.toThrow("Invalid OIDC configuration");
    });

    it("should throw when fetch itself rejects", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(
        AuthentikAdapter.getEndpoints({
          baseUrl: "https://auth.company.com",
          slug: "database-backup"
        })
      ).rejects.toThrow("Network failure");
    });

    it("should block cloud metadata URLs", async () => {
      await expect(
        AuthentikAdapter.getEndpoints({
          baseUrl: "http://169.254.169.254",
          slug: "test"
        })
      ).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
