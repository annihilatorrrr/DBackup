import { describe, it, expect } from "vitest";
import { validateOutboundUrl } from "@/lib/url-validation";

describe("validateOutboundUrl", () => {
  describe("valid URLs", () => {
    it("allows http URLs", () => {
      expect(() => validateOutboundUrl("http://example.com/api")).not.toThrow();
    });

    it("allows https URLs", () => {
      expect(() =>
        validateOutboundUrl("https://gotify.example.com/message"),
      ).not.toThrow();
    });

    it("allows localhost (self-hosted services are expected)", () => {
      expect(() =>
        validateOutboundUrl("http://localhost:8080/message"),
      ).not.toThrow();
    });

    it("allows private IP ranges (admins configure internal services)", () => {
      expect(() =>
        validateOutboundUrl("http://192.168.1.50:9090/api"),
      ).not.toThrow();
    });
  });

  describe("invalid URL format", () => {
    it("throws for completely invalid URL strings", () => {
      expect(() => validateOutboundUrl("not a url")).toThrow(
        "Invalid URL format",
      );
    });

    it("throws for empty string", () => {
      expect(() => validateOutboundUrl("")).toThrow("Invalid URL format");
    });
  });

  describe("disallowed schemes", () => {
    it("throws for file:// scheme", () => {
      expect(() => validateOutboundUrl("file:///etc/passwd")).toThrow(
        "not allowed",
      );
    });

    it("throws for gopher:// scheme", () => {
      expect(() => validateOutboundUrl("gopher://evil.com")).toThrow(
        "not allowed",
      );
    });

    it("throws for ftp:// scheme", () => {
      expect(() => validateOutboundUrl("ftp://files.example.com")).toThrow(
        "not allowed",
      );
    });
  });

  describe("blocked cloud metadata hosts", () => {
    it("blocks AWS/GCP/Azure metadata endpoint (169.254.169.254)", () => {
      expect(() =>
        validateOutboundUrl("http://169.254.169.254/latest/meta-data"),
      ).toThrow("cloud metadata");
    });

    it("blocks GCP metadata hostname", () => {
      expect(() =>
        validateOutboundUrl("http://metadata.google.internal/computeMetadata"),
      ).toThrow("cloud metadata");
    });

    it("blocks AWS IMDSv2 IPv6 endpoint", () => {
      expect(() =>
        validateOutboundUrl("http://[fd00:ec2::254]/latest/meta-data"),
      ).toThrow("cloud metadata");
    });
  });
});
