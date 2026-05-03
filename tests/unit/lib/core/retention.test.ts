import { describe, it, expect } from "vitest";
import { DEFAULT_RETENTION_CONFIG } from "@/lib/core/retention";

describe("DEFAULT_RETENTION_CONFIG", () => {
  it("has mode NONE", () => {
    expect(DEFAULT_RETENTION_CONFIG.mode).toBe("NONE");
  });

  it("has no simple or smart policy by default", () => {
    expect(DEFAULT_RETENTION_CONFIG.simple).toBeUndefined();
    expect(DEFAULT_RETENTION_CONFIG.smart).toBeUndefined();
  });
});
