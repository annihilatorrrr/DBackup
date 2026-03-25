import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import { wrapError } from "@/lib/errors";

const log = logger.child({ service: "CertificateService" });

/** Directory where TLS certificates are stored */
const CERTS_DIR = process.env.CERTS_DIR || "/app/certs";
const CERT_PATH = path.join(CERTS_DIR, "tls.crt");
const KEY_PATH = path.join(CERTS_DIR, "tls.key");

export interface CertificateInfo {
  exists: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  fingerprint: string;
  isSelfSigned: boolean;
  daysRemaining: number;
  isHttpsEnabled: boolean;
}

/**
 * Returns whether HTTPS is currently enabled.
 */
export function isHttpsEnabled(): boolean {
  return process.env.DISABLE_HTTPS !== "true";
}

/**
 * Checks whether a TLS certificate and key exist.
 */
export function certificateExists(): boolean {
  return existsSync(CERT_PATH) && existsSync(KEY_PATH);
}

/**
 * Returns information about the current TLS certificate.
 */
export function getCertificateInfo(): CertificateInfo {
  const httpsEnabled = isHttpsEnabled();

  if (!certificateExists()) {
    return {
      exists: false,
      issuer: "",
      subject: "",
      validFrom: "",
      validTo: "",
      serialNumber: "",
      fingerprint: "",
      isSelfSigned: false,
      daysRemaining: 0,
      isHttpsEnabled: httpsEnabled,
    };
  }

  try {
    const certText = execSync(
      `openssl x509 -in "${CERT_PATH}" -noout -subject -issuer -dates -serial -fingerprint -sha256`,
      { encoding: "utf-8", timeout: 5000 }
    );

    const subject = extractField(certText, "subject=") || "Unknown";
    const issuer = extractField(certText, "issuer=") || "Unknown";
    const notBefore = extractField(certText, "notBefore=") || "";
    const notAfter = extractField(certText, "notAfter=") || "";
    const serial = extractField(certText, "serial=") || "";
    const fingerprint =
      extractField(certText, "sha256 Fingerprint=") ||
      extractField(certText, "SHA256 Fingerprint=") ||
      "";

    const isSelfSigned = subject === issuer || issuer.includes("DBackup Self-Signed");

    let daysRemaining = 0;
    if (notAfter) {
      const expiryDate = new Date(notAfter);
      const now = new Date();
      daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      exists: true,
      issuer,
      subject,
      validFrom: notBefore,
      validTo: notAfter,
      serialNumber: serial,
      fingerprint,
      isSelfSigned,
      daysRemaining,
      isHttpsEnabled: httpsEnabled,
    };
  } catch (error) {
    log.error("Failed to read certificate info", {}, wrapError(error));
    return {
      exists: true,
      issuer: "Error reading certificate",
      subject: "Error reading certificate",
      validFrom: "",
      validTo: "",
      serialNumber: "",
      fingerprint: "",
      isSelfSigned: false,
      daysRemaining: 0,
      isHttpsEnabled: httpsEnabled,
    };
  }
}

/**
 * Uploads a custom certificate and key.
 * Validates format and matching before saving.
 */
export function uploadCertificate(certPem: string, keyPem: string): void {
  if (!certPem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("Invalid certificate format. Must be PEM encoded.");
  }
  if (!keyPem.includes("-----BEGIN") || !keyPem.includes("PRIVATE KEY-----")) {
    throw new Error("Invalid private key format. Must be PEM encoded.");
  }

  // Ensure directory exists
  if (!existsSync(CERTS_DIR)) {
    mkdirSync(CERTS_DIR, { recursive: true, mode: 0o700 });
  }

  const tmpCert = path.join(CERTS_DIR, "tls.crt.tmp");
  const tmpKey = path.join(CERTS_DIR, "tls.key.tmp");

  try {
    writeFileSync(tmpCert, certPem, { mode: 0o644 });
    writeFileSync(tmpKey, keyPem, { mode: 0o600 });

    // Validate cert is parseable
    execSync(`openssl x509 -in "${tmpCert}" -noout`, {
      stdio: "pipe",
      timeout: 5000,
    });

    // Validate key is parseable (try RSA first, then EC)
    try {
      execSync(`openssl rsa -in "${tmpKey}" -check -noout`, {
        stdio: "pipe",
        timeout: 5000,
      });
    } catch {
      execSync(`openssl ec -in "${tmpKey}" -check -noout`, {
        stdio: "pipe",
        timeout: 5000,
      });
    }

    // Validate cert and key match (RSA modulus comparison)
    try {
      const certModulus = execSync(
        `openssl x509 -in "${tmpCert}" -noout -modulus`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      const keyModulus = execSync(
        `openssl rsa -in "${tmpKey}" -noout -modulus`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (certModulus !== keyModulus) {
        throw new Error("Certificate and private key do not match.");
      }
    } catch (e) {
      // For EC keys, modulus check doesn't apply — skip
      if (e instanceof Error && e.message.includes("do not match")) {
        throw e;
      }
    }

    // All validations passed — replace existing files
    renameSync(tmpCert, CERT_PATH);
    renameSync(tmpKey, KEY_PATH);

    log.info("Custom TLS certificate uploaded successfully");
  } catch (error) {
    // Clean up temp files on error
    try {
      if (existsSync(tmpCert)) unlinkSync(tmpCert);
      if (existsSync(tmpKey)) unlinkSync(tmpKey);
    } catch {
      // ignore cleanup errors
    }
    throw error instanceof Error
      ? error
      : new Error(`Certificate validation failed: ${String(error)}`);
  }
}

/**
 * Regenerates the self-signed certificate, replacing the existing one.
 */
export function regenerateSelfSignedCert(): void {
  if (!existsSync(CERTS_DIR)) {
    mkdirSync(CERTS_DIR, { recursive: true, mode: 0o700 });
  }

  // Remove existing cert files
  try {
    if (existsSync(CERT_PATH)) unlinkSync(CERT_PATH);
    if (existsSync(KEY_PATH)) unlinkSync(KEY_PATH);
  } catch {
    // ignore
  }

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_PATH}" -out "${CERT_PATH}" ` +
        `-days 365 -nodes -subj "/CN=DBackup/O=DBackup Self-Signed" ` +
        `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: "pipe", timeout: 30000 }
    );
    execSync(`chmod 600 "${KEY_PATH}"`, { stdio: "pipe" });
    execSync(`chmod 644 "${CERT_PATH}"`, { stdio: "pipe" });
    log.info("Self-signed TLS certificate regenerated successfully");
  } catch (error) {
    log.error("Failed to regenerate certificate", {}, wrapError(error));
    throw new Error(
      "Failed to generate TLS certificate. Is openssl installed?"
    );
  }
}

/** Extract a field value from openssl text output */
function extractField(text: string, prefix: string): string {
  const line = text
    .split("\n")
    .find((l) => l.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? line.trim().substring(prefix.length).trim() : "";
}
