import { DatabaseAdapter } from "@/lib/core/interfaces";
import { LogLevel, LogType } from "@/lib/core/logs";
import { spawn } from "child_process";
import fs from "fs";
import { SshClient, shellEscape, extractSqliteSshConfig } from "@/lib/ssh";
import { SQLiteConfig } from "@/lib/adapters/definitions";

export const dump: DatabaseAdapter["dump"] = async (config, destinationPath, onLog, onProgress) => {
    const startedAt = new Date();
    const mode = config.mode || "local";
    const logs: string[] = [];

    const log = (msg: string, level: LogLevel = 'info', type: LogType = 'general', details?: string) => {
        logs.push(msg);
        if (onLog) onLog(msg, level, type, details);
    };

    try {
        log(`Starting SQLite dump in ${mode} mode...`);

        if (mode === "local") {
            return await dumpLocal(config as SQLiteConfig, destinationPath, log, onProgress).then(res => ({
                ...res,
                startedAt,
                completedAt: new Date(),
                logs
            }));
        } else if (mode === "ssh") {
            return await dumpSsh(config as SQLiteConfig, destinationPath, log, onProgress).then(res => ({
                ...res,
                startedAt,
                completedAt: new Date(),
                logs
            }));
        } else {
            throw new Error(`Invalid mode: ${mode}`);
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Error during dump: ${message}`);
        return {
            success: false,
            error: message,
            logs,
            startedAt,
            completedAt: new Date()
        };
    }
};

async function dumpLocal(config: SQLiteConfig, destinationPath: string, log: (msg: string, level?: LogLevel, type?: LogType, details?: string) => void, _onProgress?: (percent: number) => void): Promise<any> {
    const binaryPath = config.sqliteBinaryPath || "sqlite3";
    const dbPath = config.path;
    const writeStream = fs.createWriteStream(destinationPath);

    log(`Dumping database: ${dbPath}`, 'info', 'command', `${binaryPath} "${dbPath}" .dump`);

    return new Promise((resolve, reject) => {
        const child = spawn(binaryPath, [dbPath, ".dump"]);

        child.stdout.pipe(writeStream);

        child.stderr.on("data", (data) => {
            log(`SQLite stderr`, 'warning', 'general', data.toString().trim());
        });

        child.on("close", (code) => {
            if (code === 0) {
                log("Dump complete", 'success');
                fs.stat(destinationPath, (err, stats) => {
                    if (err) resolve({ success: true }); // Should not happen usually
                    else resolve({ success: true, size: stats.size, path: destinationPath });
                });
            } else {
                reject(new Error(`SQLite dump process failed with code ${code}`));
            }
        });

        child.on("error", (err) => {
            reject(err);
        });
    });
}

async function dumpSsh(config: SQLiteConfig, destinationPath: string, log: (msg: string, level?: LogLevel, type?: LogType, details?: string) => void, _onProgress?: (percent: number) => void): Promise<any> {
    const client = new SshClient();
    const writeStream = fs.createWriteStream(destinationPath);
    const binaryPath = config.sqliteBinaryPath || "sqlite3";
    const dbPath = config.path;

    const sshConfig = extractSqliteSshConfig(config);
    if (!sshConfig) throw new Error("SSH host and username are required");
    await client.connect(sshConfig);
    log("SSH connection established");

    return new Promise((resolve, reject) => {
        const command = `${shellEscape(binaryPath)} ${shellEscape(dbPath)} .dump`;
        log(`Dumping database (SSH): ${dbPath}`, 'info', 'command', `${binaryPath} ${dbPath} .dump`);

        client.execStream(command, (err, stream) => {
            if (err) {
                client.end();
                return reject(err);
            }

            stream.pipe(writeStream);

            stream.stderr.on("data", (data: any) => {
                log(`SQLite stderr`, 'warning', 'general', data.toString().trim());
            });

            stream.on("exit", (code: number | null, signal?: string) => {
                client.end();
                if (code === 0) {
                     log("Dump complete", 'success');
                     fs.stat(destinationPath, (err, stats) => {
                         if (err) resolve({ success: true });
                         else resolve({ success: true, size: stats.size, path: destinationPath });
                     });
                } else {
                    reject(new Error(`Remote process exited with code ${code ?? 'null'}${signal ? ` (signal: ${signal})` : ''}`));
                }
            });
        });
    });
}
