import { DatabaseAdapter } from "@/lib/core/interfaces";
import fs from "fs/promises";
import { constants } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { SshClient } from "./ssh-client";

const execFileAsync = promisify(execFile);

/**
 * Escapes a value for safe inclusion in a single-quoted shell string.
 * Handles embedded single quotes by ending the quote, adding an escaped quote, and re-opening.
 */
function shellEscape(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

export const test: DatabaseAdapter["test"] = async (config) => {
    try {
        const mode = config.mode || "local";
        const dbPath = config.path;
        const binaryPath = config.sqliteBinaryPath || "sqlite3";

        if (mode === "local") {
            // 1. Check if sqlite3 binary exists locally
            try {
                const { stdout } = await execFileAsync(binaryPath, ['--version']);
                // Parse version: "3.37.0 2021..." -> "3.37.0"
                const version = stdout.split(' ')[0].trim();

                 // 2. Check if database file exists and is readable
                await fs.access(dbPath, constants.R_OK);

                return { success: true, message: "Local SQLite connection successful.", version };
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                return { success: false, message: message || "Connection failed" };
            }

        } else if (mode === "ssh") {
            const client = new SshClient();
            try {
                await client.connect(config);

                 // 1. Check if sqlite3 binary exists on remote
                 const binaryResult = await client.exec(`${shellEscape(binaryPath)} --version`);
                 if (binaryResult.code !== 0) {
                     client.end();
                     return { success: false, message: `Remote SQLite3 binary check failed: ${binaryResult.stderr || "Command failed"}` };
                 }
                 const version = binaryResult.stdout.split(' ')[0].trim();

                 // 2. Check if database file exists on remote (using stat)
                 // We use a simple test: sqlite3 [path] "SELECT 1;"
                 // Or just `test -f [path]`

                 const fileCheck = await client.exec(`test -f ${shellEscape(dbPath)} && echo "exists"`);
                 if (!fileCheck.stdout.includes("exists")) {
                    client.end();
                    return { success: false, message: `Remote database file at '${dbPath}' not found.` };
                 }

                 client.end();
                 return { success: true, message: "Remote SSH SQLite connection successful.", version };

            } catch (err: unknown) {
                client.end();
                const message = err instanceof Error ? err.message : String(err);
                return { success: false, message: `SSH Connection failed: ${message}` };
            }
        }

        return { success: false, message: "Invalid mode selected" };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message };
    }
};

export const getDatabases: DatabaseAdapter["getDatabases"] = async (config) => {
     // For SQLite, the path itself is the database. We can return the filename.
     const path = config.path as string;
     const name = path.split(/[\\/]/).pop() || "database.sqlite";
     return [name];
};

export const getDatabasesWithStats: DatabaseAdapter["getDatabasesWithStats"] = async (config) => {
    const dbPath = config.path as string;
    const name = dbPath.split(/[\\/]/).pop() || "database.sqlite";
    const mode = config.mode || "local";
    const binaryPath = (config.sqliteBinaryPath as string) || "sqlite3";

    let sizeInBytes: number | undefined;
    let tableCount: number | undefined;

    try {
        if (mode === "local") {
            // Get file size
            const stat = await fs.stat(dbPath);
            sizeInBytes = stat.size;

            // Get table count
            try {
                const { stdout } = await execFileAsync(
                    binaryPath, [dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"]
                );
                const count = parseInt(stdout.trim(), 10);
                if (!isNaN(count)) tableCount = count;
            } catch {
                // Table count is optional, ignore errors
            }
        } else if (mode === "ssh") {
            const client = new SshClient();
            try {
                await client.connect(config);

                // Get file size via stat
                const sizeResult = await client.exec(`stat -c %s ${shellEscape(dbPath)} 2>/dev/null || stat -f %z ${shellEscape(dbPath)} 2>/dev/null`);
                if (sizeResult.code === 0) {
                    const size = parseInt(sizeResult.stdout.trim(), 10);
                    if (!isNaN(size)) sizeInBytes = size;
                }

                // Get table count
                try {
                    const tableResult = await client.exec(
                        `${shellEscape(binaryPath)} ${shellEscape(dbPath)} "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`
                    );
                    if (tableResult.code === 0) {
                        const count = parseInt(tableResult.stdout.trim(), 10);
                        if (!isNaN(count)) tableCount = count;
                    }
                } catch {
                    // Table count is optional
                }

                client.end();
            } catch {
                client.end();
            }
        }
    } catch {
        // If stats fail, return name only
    }

    return [{ name, sizeInBytes, tableCount }];
};
