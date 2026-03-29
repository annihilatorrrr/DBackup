import { DatabaseAdapter } from "@/lib/core/interfaces";
import fs from "fs/promises";
import { constants } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { SshClient, shellEscape, extractSqliteSshConfig, remoteBinaryCheck } from "@/lib/ssh";

const execFileAsync = promisify(execFile);

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
            const sshConfig = extractSqliteSshConfig(config);
            if (!sshConfig) return { success: false, message: "SSH host and username are required" };

            const client = new SshClient();
            try {
                await client.connect(sshConfig);

                // 1. Check if sqlite3 binary exists on remote
                const resolvedBinary = await remoteBinaryCheck(client, binaryPath);
                const versionResult = await client.exec(`${shellEscape(resolvedBinary)} --version`);
                const version = versionResult.stdout.split(' ')[0].trim();

                // 2. Check if database file exists on remote
                const fileCheck = await client.exec(`test -f ${shellEscape(dbPath)} && echo "exists"`);
                if (!fileCheck.stdout.includes("exists")) {
                    return { success: false, message: `Remote database file at '${dbPath}' not found.` };
                }

                return { success: true, message: "Remote SSH SQLite connection successful.", version };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return { success: false, message: `SSH Connection failed: ${message}` };
            } finally {
                client.end();
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
            const sshConfig = extractSqliteSshConfig(config);
            if (!sshConfig) return [{ name, sizeInBytes: undefined, tableCount: undefined }];

            const client = new SshClient();
            try {
                await client.connect(sshConfig);

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
            } catch {
                // If stats fail, return name only
            } finally {
                client.end();
            }
        }
    } catch {
        // If stats fail, return name only
    }

    return [{ name, sizeInBytes, tableCount }];
};
