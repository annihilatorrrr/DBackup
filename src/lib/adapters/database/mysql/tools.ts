import { execFile } from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

// Cache detection results to avoid spawning processes repeatedly
let cachedMysqlCmd: string | null = null;
let cachedMysqldumpCmd: string | null = null;
let cachedMysqladminCmd: string | null = null;

// Initialization promise to detect commands once asynchronously
let initPromise: Promise<void> | null = null;

async function detectCommand(candidates: string[]): Promise<string> {
    for (const cmd of candidates) {
        try {
            await execFileAsync("which", [cmd]);
            return cmd;
        } catch {
            continue;
        }
    }
    // Fallback to the first candidate if nothing works (let it fail later with a clear error)
    return candidates[0];
}

async function initCommands(): Promise<void> {
    if (!initPromise) {
        initPromise = (async () => {
            const [mysql, mysqldump, mysqladmin] = await Promise.all([
                detectCommand(['mariadb', 'mysql']),
                detectCommand(['mariadb-dump', 'mysqldump']),
                detectCommand(['mariadb-admin', 'mysqladmin']),
            ]);
            cachedMysqlCmd = mysql;
            cachedMysqldumpCmd = mysqldump;
            cachedMysqladminCmd = mysqladmin;
        })();
    }
    return initPromise;
}

export function getMysqlCommand(): string {
    // Return cached value or fallback - initCommands() should be called before first use
    return cachedMysqlCmd ?? 'mariadb';
}

export function getMysqldumpCommand(): string {
    return cachedMysqldumpCmd ?? 'mariadb-dump';
}

export function getMysqladminCommand(): string {
    return cachedMysqladminCmd ?? 'mariadb-admin';
}

/** Call once during startup or before first adapter use to detect available commands */
export { initCommands as initMysqlTools };
