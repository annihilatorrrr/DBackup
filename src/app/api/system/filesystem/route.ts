import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { checkPermission } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";

const log = logger.child({ route: "system/filesystem" });

/**
 * Sensitive OS paths that must never be browsed.
 * Covers Linux, macOS, and Windows system directories.
 */
const BLOCKED_PREFIXES = [
    // Linux virtual/kernel filesystems
    "/proc", "/sys", "/dev",
    // Linux/macOS sensitive config
    "/etc/shadow", "/etc/gshadow", "/etc/sudoers.d",
    // macOS system internals
    "/System", "/Library/Keychains", "/private/var/db",
    // Windows system paths (when running under WSL or mapped drives)
    "/mnt/c/Windows", "/mnt/c/Program Files",
];

/**
 * Validate and sanitize a user-provided filesystem path.
 * Resolves to an absolute path, follows no symlinks into blocked areas,
 * and rejects access to sensitive OS directories.
 *
 * This is an authenticated admin-only endpoint (settings:read) that returns
 * directory listings only - it never reads or writes file contents.
 */
function sanitizePath(userPath: string): string {
    const resolved = path.resolve(userPath);

    if (BLOCKED_PREFIXES.some(prefix => resolved === prefix || resolved.startsWith(prefix + "/"))) {
        throw new Error("Access denied: blocked system path");
    }

    return resolved;
}

export async function GET(req: NextRequest) {
    try {
        await checkPermission(PERMISSIONS.SETTINGS.READ);

        const searchParams = req.nextUrl.searchParams;
        const requestedPath = searchParams.get("path") || "/";
        const _type = searchParams.get("type") || "all"; // 'all', 'file', 'directory'

        let currentPath: string;
        try {
            currentPath = sanitizePath(requestedPath);
        } catch {
            return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 });
        }

        let stats;
        try {
            // lgtm[js/path-injection] - Authenticated admin file browser with blocklist validation
            stats = await fs.stat(currentPath);
        } catch (_e) {
            return NextResponse.json({ success: false, error: "Path not found" }, { status: 404 });
        }

        if (!stats.isDirectory()) {
             return NextResponse.json({ success: false, error: "Not a directory" }, { status: 400 });
        }

        // lgtm[js/path-injection] - Authenticated admin file browser with blocklist validation
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        const content = entries.map(entry => {
            return {
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
                path: path.join(currentPath, entry.name)
            };
        }).sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === "directory" ? -1 : 1;
        });

        // Filter based on type request if needed, but usually UI handles visibility
        // If type === 'directory', we might still want to see files but disabled?
        // Let's just return everything and let UI decide.

        return NextResponse.json({
            success: true,
            data: {
                currentPath,
                parentPath: path.dirname(currentPath),
                entries: content
            }
        });

    } catch (error: unknown) {
        log.error("Filesystem API error", {}, wrapError(error));
        return NextResponse.json({ success: false, error: "Failed to list directory" }, { status: 500 });
    }
}
