/**
 * DBackup Custom Server — HTTPS by default, HTTP optional.
 *
 * This file replaces the Next.js standalone server.js as the Docker entry point.
 * It creates an HTTPS server (with auto-generated self-signed cert if needed)
 * and delegates request handling to the Next.js application.
 *
 * Environment variables:
 *   DISABLE_HTTPS  - "true" to use plain HTTP (default: false → HTTPS)
 *   PORT           - Listen port (default: 3000)
 *   HOSTNAME       - Bind address (default: "0.0.0.0")
 *   CERTS_DIR      - Directory for tls.crt/tls.key (default: "/data/certs")
 */

const { createServer: createHttpsServer } = require("node:https");
const { createServer: createHttpServer } = require("node:http");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

// ── Configuration ──────────────────────────────────────────────
process.chdir(__dirname);

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const disableHttps = process.env.DISABLE_HTTPS === "true";
const certsDir = process.env.CERTS_DIR || "/data/certs";
const certPath = path.join(certsDir, "tls.crt");
const keyPath = path.join(certsDir, "tls.key");

// ── Next.js Setup ────────────────────────────────────────────
// Load the Next.js standalone config and create server instance
const config = require("./.next/required-server-files.json").config;
const NextNodeServer = require("next/dist/server/next-server").default;

const nextApp = new NextNodeServer({
  hostname,
  port,
  dir: __dirname,
  dev: false,
  customServer: true,
  conf: config,
});

const handler = nextApp.getRequestHandler();

// ── TLS Certificate Management ────────────────────────────────

function ensureCertificate() {
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log("[TLS] Using existing certificate from " + certsDir);
    return true;
  }

  console.log("[TLS] No certificate found. Generating self-signed certificate...");
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
        `-days 365 -nodes -subj "/CN=DBackup/O=DBackup Self-Signed" ` +
        `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: "pipe", timeout: 30000 }
    );
    execSync(`chmod 600 "${keyPath}"`, { stdio: "pipe" });
    execSync(`chmod 644 "${certPath}"`, { stdio: "pipe" });
    console.log("[TLS] Self-signed certificate generated successfully");
    return true;
  } catch (err) {
    console.error("[TLS] Failed to generate certificate:", err.message);
    console.error(
      "[TLS] Falling back to HTTP. Install openssl or provide custom certificates."
    );
    return false;
  }
}

// ── Server Start ──────────────────────────────────────────────

function start() {
  let server;
  let protocol;

  if (disableHttps) {
    protocol = "http";
    server = createHttpServer(async (req, res) => {
      await handler(req, res);
    });
    console.log("[Server] HTTPS disabled via DISABLE_HTTPS=true — using HTTP");
  } else {
    const certReady = ensureCertificate();

    if (certReady && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      protocol = "https";
      const tlsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      };
      server = createHttpsServer(tlsOptions, async (req, res) => {
        await handler(req, res);
      });
      console.log("[Server] HTTPS enabled with certificate from " + certsDir);
    } else {
      protocol = "http";
      server = createHttpServer(async (req, res) => {
        await handler(req, res);
      });
      console.warn(
        "[Server] WARNING: Falling back to HTTP — certificate generation failed"
      );
    }
  }

  server.listen(port, hostname, () => {
    console.log(
      `[Server] DBackup ready on ${protocol}://${hostname}:${port}`
    );
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[Server] ${signal} received — shutting down...`);
    server.close(() => {
      console.log("[Server] Closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
