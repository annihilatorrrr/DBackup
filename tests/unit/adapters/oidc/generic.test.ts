import { describe, it, expect } from "vitest";
import { GenericAdapter } from "@/lib/adapters/oidc/generic";

const VALID_CONFIG = {
  issuer: "https://auth.example.com",
  authorizationEndpoint: "https://auth.example.com/oauth/authorize",
  tokenEndpoint: "https://auth.example.com/oauth/token",
  userInfoEndpoint: "https://auth.example.com/oauth/userinfo",
  jwksEndpoint: "https://auth.example.com/oauth/jwks"
};

describe("GenericAdapter", () => {
  describe("metadata", () => {
    it("should have correct id", () => {
      expect(GenericAdapter.id).toBe("generic");
    });

    it("should have correct name", () => {
      expect(GenericAdapter.name).toBe("Generic OIDC");
    });

    it("should expose all required OIDC endpoint inputs", () => {
      const names = GenericAdapter.inputs.map((i) => i.name);
      expect(names).toContain("issuer");
      expect(names).toContain("authorizationEndpoint");
      expect(names).toContain("tokenEndpoint");
      expect(names).toContain("userInfoEndpoint");
      expect(names).toContain("jwksEndpoint");
    });

    it("should mark issuer, authorizationEndpoint, tokenEndpoint, userInfoEndpoint as required", () => {
      const requiredNames = GenericAdapter.inputs
        .filter((i) => i.required)
        .map((i) => i.name);
      expect(requiredNames).toEqual(
        expect.arrayContaining(["issuer", "authorizationEndpoint", "tokenEndpoint", "userInfoEndpoint"])
      );
    });

    it("should mark jwksEndpoint as optional", () => {
      const jwks = GenericAdapter.inputs.find((i) => i.name === "jwksEndpoint");
      expect(jwks?.required).toBeFalsy();
    });
  });

  describe("inputSchema", () => {
    it("should accept a fully populated config", () => {
      const result = GenericAdapter.inputSchema.safeParse(VALID_CONFIG);
      expect(result.success).toBe(true);
    });

    it("should accept config without jwksEndpoint", () => {
      const { jwksEndpoint: _, ...rest } = VALID_CONFIG;
      const result = GenericAdapter.inputSchema.safeParse(rest);
      expect(result.success).toBe(true);
    });

    it("should accept empty string for jwksEndpoint", () => {
      const result = GenericAdapter.inputSchema.safeParse({
        ...VALID_CONFIG,
        jwksEndpoint: ""
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-URL issuer", () => {
      const result = GenericAdapter.inputSchema.safeParse({
        ...VALID_CONFIG,
        issuer: "not-a-url"
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-URL authorizationEndpoint", () => {
      const result = GenericAdapter.inputSchema.safeParse({
        ...VALID_CONFIG,
        authorizationEndpoint: "not-a-url"
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-URL tokenEndpoint", () => {
      const result = GenericAdapter.inputSchema.safeParse({
        ...VALID_CONFIG,
        tokenEndpoint: "not-a-url"
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-URL userInfoEndpoint", () => {
      const result = GenericAdapter.inputSchema.safeParse({
        ...VALID_CONFIG,
        userInfoEndpoint: "not-a-url"
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const result = GenericAdapter.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("getEndpoints", () => {
    it("should map config fields directly to endpoints", () => {
      const endpoints = GenericAdapter.getEndpoints(VALID_CONFIG) as ReturnType<
        typeof GenericAdapter.getEndpoints
      >;

      expect(endpoints.issuer).toBe(VALID_CONFIG.issuer);
      expect(endpoints.authorizationEndpoint).toBe(VALID_CONFIG.authorizationEndpoint);
      expect(endpoints.tokenEndpoint).toBe(VALID_CONFIG.tokenEndpoint);
      expect(endpoints.userInfoEndpoint).toBe(VALID_CONFIG.userInfoEndpoint);
      expect(endpoints.jwksEndpoint).toBe(VALID_CONFIG.jwksEndpoint);
    });

    it("should derive discoveryEndpoint from issuer", () => {
      const endpoints = GenericAdapter.getEndpoints(VALID_CONFIG) as ReturnType<
        typeof GenericAdapter.getEndpoints
      >;

      expect(endpoints.discoveryEndpoint).toBe(
        "https://auth.example.com/.well-known/openid-configuration"
      );
    });

    it("should strip trailing slash from issuer when deriving discoveryEndpoint", () => {
      const endpoints = GenericAdapter.getEndpoints({
        ...VALID_CONFIG,
        issuer: "https://auth.example.com/"
      }) as ReturnType<typeof GenericAdapter.getEndpoints>;

      expect(endpoints.discoveryEndpoint).toBe(
        "https://auth.example.com/.well-known/openid-configuration"
      );
    });

    it("should return undefined for jwksEndpoint when it is an empty string", () => {
      const endpoints = GenericAdapter.getEndpoints({
        ...VALID_CONFIG,
        jwksEndpoint: ""
      }) as ReturnType<typeof GenericAdapter.getEndpoints>;

      expect(endpoints.jwksEndpoint).toBeUndefined();
    });

    it("should return undefined for discoveryEndpoint when issuer is missing", () => {
      const { issuer: _, ...rest } = VALID_CONFIG;
      const endpoints = GenericAdapter.getEndpoints(rest) as ReturnType<
        typeof GenericAdapter.getEndpoints
      >;

      expect(endpoints.discoveryEndpoint).toBeUndefined();
    });

    it("should be synchronous (no Promise returned)", () => {
      const result = GenericAdapter.getEndpoints(VALID_CONFIG);
      expect(result).not.toBeInstanceOf(Promise);
    });
  });
});
