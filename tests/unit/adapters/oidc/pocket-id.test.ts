import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PocketIDAdapter } from "@/lib/adapters/oidc/pocket-id";

const VALID_OIDC_RESPONSE = {
  issuer: "https://pid.company.com",
  authorization_endpoint: "https://pid.company.com/authorize",
  token_endpoint: "https://pid.company.com/token",
  userinfo_endpoint: "https://pid.company.com/userinfo",
  jwks_uri: "https://pid.company.com/jwks"
};

describe("PocketIDAdapter", () => {
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
      expect(PocketIDAdapter.id).toBe("pocket-id");
    });

    it("should have correct name", () => {
      expect(PocketIDAdapter.name).toBe("PocketID");
    });

    it("should expose a single baseUrl input", () => {
      expect(PocketIDAdapter.inputs).toHaveLength(1);
      expect(PocketIDAdapter.inputs[0].name).toBe("baseUrl");
    });

    it("should mark baseUrl as required", () => {
      expect(PocketIDAdapter.inputs[0].required).toBe(true);
    });
  });

  describe("inputSchema", () => {
    it("should accept a valid URL", () => {
      const result = PocketIDAdapter.inputSchema.safeParse({
        baseUrl: "https://pid.company.com"
      });
      expect(result.success).toBe(true);
    });

    it("should reject a non-URL string", () => {
      const result = PocketIDAdapter.inputSchema.safeParse({
        baseUrl: "not-a-url"
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing baseUrl", () => {
      const result = PocketIDAdapter.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("getEndpoints", () => {
    it("should call the standard .well-known discovery URL", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await PocketIDAdapter.getEndpoints({ baseUrl: "https://pid.company.com" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pid.company.com/.well-known/openid-configuration"
      );
    });

    it("should strip trailing slash from baseUrl", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      await PocketIDAdapter.getEndpoints({ baseUrl: "https://pid.company.com/" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://pid.company.com/.well-known/openid-configuration"
      );
    });

    it("should return mapped endpoints on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_OIDC_RESPONSE
      });

      const endpoints = await PocketIDAdapter.getEndpoints({
        baseUrl: "https://pid.company.com"
      });

      expect(endpoints.issuer).toBe(VALID_OIDC_RESPONSE.issuer);
      expect(endpoints.authorizationEndpoint).toBe(VALID_OIDC_RESPONSE.authorization_endpoint);
      expect(endpoints.tokenEndpoint).toBe(VALID_OIDC_RESPONSE.token_endpoint);
      expect(endpoints.userInfoEndpoint).toBe(VALID_OIDC_RESPONSE.userinfo_endpoint);
      expect(endpoints.jwksEndpoint).toBe(VALID_OIDC_RESPONSE.jwks_uri);
      expect(endpoints.discoveryEndpoint).toBe(
        "https://pid.company.com/.well-known/openid-configuration"
      );
    });

    it("should throw when discovery returns non-ok status", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503
      });

      await expect(
        PocketIDAdapter.getEndpoints({ baseUrl: "https://pid.company.com" })
      ).rejects.toThrow("503");
    });

    it("should throw when fetch itself rejects", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      await expect(
        PocketIDAdapter.getEndpoints({ baseUrl: "https://pid.company.com" })
      ).rejects.toThrow("Connection refused");
    });

    it("should block cloud metadata URLs", async () => {
      await expect(
        PocketIDAdapter.getEndpoints({ baseUrl: "http://169.254.169.254" })
      ).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
