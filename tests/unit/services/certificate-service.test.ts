import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting, so the fns are available in factories
const {
  mockExecSync,
  mockExistsSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockUnlinkSync,
  mockRenameSync,
} = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockRenameSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: { execSync: mockExecSync },
  execSync: mockExecSync,
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    unlinkSync: mockUnlinkSync,
    renameSync: mockRenameSync,
  },
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  unlinkSync: mockUnlinkSync,
  renameSync: mockRenameSync,
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

vi.mock("@/lib/logging/errors", () => ({
  wrapError: (e: unknown) => e,
}));

import {
  isHttpsEnabled,
  certificateExists,
  getCertificateInfo,
  uploadCertificate,
  regenerateSelfSignedCert,
} from "@/services/system/certificate-service";

describe("CertificateService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── isHttpsEnabled ─────────────────────────────────────────

  describe("isHttpsEnabled", () => {
    it("should return true when DISABLE_HTTPS is not set", () => {
      delete process.env.DISABLE_HTTPS;
      expect(isHttpsEnabled()).toBe(true);
    });

    it("should return false when DISABLE_HTTPS is 'true'", () => {
      process.env.DISABLE_HTTPS = "true";
      expect(isHttpsEnabled()).toBe(false);
    });

    it("should return true when DISABLE_HTTPS is 'false'", () => {
      process.env.DISABLE_HTTPS = "false";
      expect(isHttpsEnabled()).toBe(true);
    });
  });

  // ── certificateExists ──────────────────────────────────────

  describe("certificateExists", () => {
    it("should return true when both cert and key exist", () => {
      mockExistsSync.mockReturnValue(true);
      expect(certificateExists()).toBe(true);
    });

    it("should return false when cert is missing", () => {
      mockExistsSync.mockImplementation((p: string) =>
        p.endsWith("tls.key")
      );
      expect(certificateExists()).toBe(false);
    });

    it("should return false when key is missing", () => {
      mockExistsSync.mockImplementation((p: string) =>
        p.endsWith("tls.crt")
      );
      expect(certificateExists()).toBe(false);
    });
  });

  // ── getCertificateInfo ─────────────────────────────────────

  describe("getCertificateInfo", () => {
    it("should return empty info when no certificate exists", () => {
      mockExistsSync.mockReturnValue(false);

      const info = getCertificateInfo();

      expect(info.exists).toBe(false);
      expect(info.issuer).toBe("");
      expect(info.subject).toBe("");
      expect(info.daysRemaining).toBe(0);
    });

    it("should parse openssl output for a self-signed certificate", () => {
      mockExistsSync.mockReturnValue(true);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 300);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 65);

      const opensslOutput = [
        "subject=CN = DBackup, O = DBackup Self-Signed",
        "issuer=CN = DBackup, O = DBackup Self-Signed",
        `notBefore=${pastDate.toUTCString()}`,
        `notAfter=${futureDate.toUTCString()}`,
        "serial=ABC123",
        "SHA256 Fingerprint=AA:BB:CC:DD",
      ].join("\n");

      mockExecSync.mockReturnValue(opensslOutput);

      const info = getCertificateInfo();

      expect(info.exists).toBe(true);
      expect(info.isSelfSigned).toBe(true);
      expect(info.subject).toBe("CN = DBackup, O = DBackup Self-Signed");
      expect(info.issuer).toBe("CN = DBackup, O = DBackup Self-Signed");
      expect(info.serialNumber).toBe("ABC123");
      expect(info.fingerprint).toBe("AA:BB:CC:DD");
      expect(info.daysRemaining).toBeGreaterThan(290);
      expect(info.daysRemaining).toBeLessThanOrEqual(300);
    });

    it("should detect non-self-signed certificate", () => {
      mockExistsSync.mockReturnValue(true);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 90);

      const opensslOutput = [
        "subject=CN = myapp.example.com",
        "issuer=CN = Let's Encrypt Authority X3, O = Let's Encrypt",
        `notBefore=${new Date().toUTCString()}`,
        `notAfter=${futureDate.toUTCString()}`,
        "serial=0123456789",
        "SHA256 Fingerprint=11:22:33:44",
      ].join("\n");

      mockExecSync.mockReturnValue(opensslOutput);

      const info = getCertificateInfo();

      expect(info.isSelfSigned).toBe(false);
      expect(info.issuer).toContain("Let's Encrypt");
    });

    it("should return error info when openssl fails", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => {
        throw new Error("openssl not found");
      });

      const info = getCertificateInfo();

      expect(info.exists).toBe(true);
      expect(info.issuer).toBe("Error reading certificate");
      expect(info.daysRemaining).toBe(0);
    });
  });

  // ── uploadCertificate ──────────────────────────────────────

  describe("uploadCertificate", () => {
    const validCert =
      "-----BEGIN CERTIFICATE-----\nMIIBxTCCAW...\n-----END CERTIFICATE-----";
    const validKey =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADA...\n-----END PRIVATE KEY-----";

    it("should reject invalid certificate format", () => {
      expect(() => uploadCertificate("not a cert", validKey)).toThrow(
        "Invalid certificate format"
      );
    });

    it("should reject invalid key format", () => {
      expect(() => uploadCertificate(validCert, "not a key")).toThrow(
        "Invalid private key format"
      );
    });

    it("should create certs directory if it does not exist", () => {
      mockExistsSync.mockImplementation((p: string) => {
        // CERTS_DIR doesn't exist, but tmp files do after write
        if (p.includes("tls.crt.tmp") || p.includes("tls.key.tmp"))
          return true;
        return false;
      });
      mockExecSync.mockReturnValue("");

      uploadCertificate(validCert, validKey);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should write temp files, validate, then rename to final paths", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("Modulus=ABC123");

      uploadCertificate(validCert, validKey);

      // Wrote temp files
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining("tls.crt.tmp"),
        validCert,
        expect.any(Object)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining("tls.key.tmp"),
        validKey,
        expect.any(Object)
      );

      // Renamed to final paths
      expect(mockRenameSync).toHaveBeenCalledTimes(2);
      expect(mockRenameSync).toHaveBeenCalledWith(
        expect.stringContaining("tls.crt.tmp"),
        expect.stringContaining("tls.crt")
      );
    });

    it("should throw when cert and key modulus do not match", () => {
      mockExistsSync.mockReturnValue(true);
      let callCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.includes("-modulus")) {
          callCount++;
          return callCount === 1 ? "Modulus=AAA" : "Modulus=BBB";
        }
        return "";
      });

      expect(() => uploadCertificate(validCert, validKey)).toThrow(
        "do not match"
      );
    });

    it("should clean up temp files on validation failure", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation((cmd: string) => {
        // Fail on cert parse
        if (typeof cmd === "string" && cmd.includes("x509") && cmd.includes("-noout")) {
          throw new Error("unable to load certificate");
        }
        return "";
      });

      expect(() => uploadCertificate(validCert, validKey)).toThrow();

      // Should attempt to clean up temp files
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it("should accept EC key when RSA check fails with unrelated error", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("openssl rsa") && cmd.includes("-check")) {
          throw new Error("not an RSA key");
        }
        if (cmd.includes("openssl ec") && cmd.includes("-check")) {
          return "";
        }
        if (cmd.includes("openssl x509") && cmd.includes("-modulus")) {
          return "Modulus=some_ec_value";
        }
        if (cmd.includes("openssl rsa") && cmd.includes("-modulus")) {
          throw new Error("unable to load RSA key");
        }
        return "";
      });

      expect(() => uploadCertificate(validCert, validKey)).not.toThrow();
      expect(mockRenameSync).toHaveBeenCalledTimes(2);
    });
  });

  // ── regenerateSelfSignedCert ───────────────────────────────

  describe("regenerateSelfSignedCert", () => {
    it("should create certs directory if missing", () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should remove existing cert files before generating", () => {
      // First call: CERTS_DIR exists, then cert exists, then key exists
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    });

    it("should call openssl to generate a 365-day self-signed cert", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("-days 365"),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("DBackup Self-Signed"),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("subjectAltName=DNS:localhost,IP:127.0.0.1"),
        expect.any(Object)
      );
    });

    it("should set correct file permissions", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("chmod 600"),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("chmod 644"),
        expect.any(Object)
      );
    });

    it("should throw when openssl is not available", () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.includes("openssl req")) {
          throw new Error("openssl: command not found");
        }
        return "";
      });

      expect(() => regenerateSelfSignedCert()).toThrow(
        "Failed to generate TLS certificate"
      );
    });

    it("should add a DNS SAN when BETTER_AUTH_URL has a custom hostname", () => {
      process.env.BETTER_AUTH_URL = "https://myapp.example.com";
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      const opensslCall = mockExecSync.mock.calls.find(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("openssl req -x509")
      );
      expect(opensslCall?.[0]).toContain(",DNS:myapp.example.com");
    });

    it("should add an IP SAN when BETTER_AUTH_URL has an IP address", () => {
      process.env.BETTER_AUTH_URL = "https://192.168.1.100";
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      const opensslCall = mockExecSync.mock.calls.find(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("openssl req -x509")
      );
      expect(opensslCall?.[0]).toContain(",IP:192.168.1.100");
    });

    it("should not add extra SAN when BETTER_AUTH_URL is localhost", () => {
      process.env.BETTER_AUTH_URL = "https://localhost";
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      const opensslCall = mockExecSync.mock.calls.find(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("openssl req -x509")
      );
      expect(opensslCall).toBeDefined();
      // Only the base SANs - the extension closes immediately after the default IP
      expect(opensslCall?.[0]).toContain('subjectAltName=DNS:localhost,IP:127.0.0.1"');
    });

    it("should not add extra SAN when BETTER_AUTH_URL is 127.0.0.1", () => {
      process.env.BETTER_AUTH_URL = "https://127.0.0.1";
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      const opensslCall = mockExecSync.mock.calls.find(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("openssl req -x509")
      );
      expect(opensslCall).toBeDefined();
      expect(opensslCall?.[0]).toContain('subjectAltName=DNS:localhost,IP:127.0.0.1"');
    });

    it("should not add extra SAN when BETTER_AUTH_URL is an invalid URL", () => {
      process.env.BETTER_AUTH_URL = "not-a-valid-url";
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("");

      regenerateSelfSignedCert();

      const opensslCall = mockExecSync.mock.calls.find(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("openssl req -x509")
      );
      expect(opensslCall).toBeDefined();
      expect(opensslCall?.[0]).toContain('subjectAltName=DNS:localhost,IP:127.0.0.1"');
    });
  });

  // ── Branch coverage: missing openssl output fields ─────────

  describe("getCertificateInfo - missing fields fallback", () => {
    it("should return 'Unknown' for subject and issuer when not present in openssl output", () => {
      mockExistsSync.mockReturnValue(true);
      // Output has no subject= or issuer= lines
      mockExecSync.mockReturnValue("notBefore=Jan  1 00:00:00 2024 GMT\nnotAfter=Jan  1 00:00:00 2025 GMT");

      const info = getCertificateInfo();

      expect(info.subject).toBe("Unknown");
      expect(info.issuer).toBe("Unknown");
    });

    it("should return empty fingerprint when no SHA256 fingerprint line is present", () => {
      mockExistsSync.mockReturnValue(true);
      // Output has subject/issuer but no fingerprint
      mockExecSync.mockReturnValue(
        "subject=CN = Test\nissuer=CN = Test\nnotBefore=Jan  1 00:00:00 2024 GMT\nnotAfter=Jan  1 00:00:00 2025 GMT\nserial=AABB"
      );

      const info = getCertificateInfo();

      expect(info.fingerprint).toBe("");
    });

    it("should return empty validFrom/validTo when notBefore/notAfter are absent", () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue("subject=CN = Test\nissuer=CN = Test\nserial=AABB");

      const info = getCertificateInfo();

      expect(info.validFrom).toBe("");
      expect(info.validTo).toBe("");
      expect(info.daysRemaining).toBe(0);
    });
  });

  // ── Branch coverage: cleanup with non-existent temp files ──

  describe("uploadCertificate - cleanup when temp files do not exist", () => {
    it("should not call unlinkSync when temp files are absent during error cleanup", () => {
      mockExistsSync.mockImplementation((p: string) => {
        // CERTS_DIR exists but temp files do NOT exist
        if (typeof p === "string" && p.includes(".tmp")) return false;
        return true;
      });
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error("Disk full");
      });

      const validCert = "-----BEGIN CERTIFICATE-----\ndata\n-----END CERTIFICATE-----";
      const validKey = "-----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----";

      expect(() => uploadCertificate(validCert, validKey)).toThrow("Disk full");
      // existsSync returned false for .tmp files, so unlinkSync is never called
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
  });
});
