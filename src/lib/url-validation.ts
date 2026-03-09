/**
 * URL validation utilities to mitigate SSRF risks.
 *
 * Since this is a self-hosted application where admins intentionally
 * configure internal services (e.g. Gotify on localhost), we do NOT
 * block private IPs. Instead, we block:
 * - Cloud metadata endpoints (169.254.169.254, fd00:ec2::254)
 * - Dangerous URL schemes (file://, gopher://, etc.)
 */

const BLOCKED_HOSTS = [
    "169.254.169.254",        // AWS/GCP/Azure metadata
    "metadata.google.internal", // GCP metadata
    "[fd00:ec2::254]",        // AWS IMDSv2 IPv6
];

const ALLOWED_SCHEMES = ["http:", "https:"];

/**
 * Validates a URL to prevent SSRF attacks against cloud metadata services.
 * Throws an error if the URL targets a blocked endpoint.
 */
export function validateOutboundUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid URL format");
    }

    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
        throw new Error(`URL scheme '${parsed.protocol}' is not allowed. Use http: or https:.`);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(hostname)) {
        throw new Error("URLs targeting cloud metadata services are not allowed.");
    }
}
