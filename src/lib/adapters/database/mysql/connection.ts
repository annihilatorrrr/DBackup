import { execFile } from "child_process";
import util from "util";
import { getMysqlCommand, getMysqladminCommand } from "./tools";
import { MySQLConfig } from "@/lib/adapters/definitions";
import {
    SshClient,
    isSSHMode,
    extractSshConfig,
    buildMysqlArgs,
    remoteEnv,
    remoteBinaryCheck,
    shellEscape,
} from "@/lib/ssh";

export const execFileAsync = util.promisify(execFile);

export async function ensureDatabase(config: MySQLConfig, dbName: string, user: string, pass: string | undefined, privileged: boolean, logs: string[]) {
    if (isSSHMode(config)) {
        const sshConfig = extractSshConfig(config)!;
        const ssh = new SshClient();
        try {
            await ssh.connect(sshConfig);
            const mysqlBin = await remoteBinaryCheck(ssh, "mariadb", "mysql");
            const args = buildMysqlArgs(config, user);
            const env: Record<string, string | undefined> = {};
            if (pass) env.MYSQL_PWD = pass;

            const createCmd = remoteEnv(env, `${mysqlBin} ${args.join(" ")} -e ${shellEscape(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``)}`);
            const result = await ssh.exec(createCmd);
            if (result.code !== 0) {
                logs.push(`Warning ensures DB '${dbName}': ${result.stderr}`);
                return;
            }
            logs.push(`Database '${dbName}' ensured.`);

            if (privileged) {
                const grantQuery = `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${config.user}'@'%'; GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${config.user}'@'localhost'; FLUSH PRIVILEGES;`;
                const grantCmd = remoteEnv(env, `${mysqlBin} ${args.join(" ")} -e ${shellEscape(grantQuery)}`);
                const grantResult = await ssh.exec(grantCmd);
                if (grantResult.code === 0) {
                    logs.push(`Permissions granted for '${dbName}'.`);
                } else {
                    logs.push(`Warning grants for '${dbName}': ${grantResult.stderr}`);
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logs.push(`Warning ensures DB '${dbName}': ${message}`);
        } finally {
            ssh.end();
        }
        return;
    }

    const args = ['-h', config.host, '-P', String(config.port), '-u', user, '--protocol=tcp'];
    if (config.disableSsl) {
        args.push('--skip-ssl');
    }
    const env = { ...process.env };
    if (pass) env.MYSQL_PWD = pass;

    try {
       await execFileAsync(getMysqlCommand(), [...args, '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\``], { env });
       logs.push(`Database '${dbName}' ensured.`);
       if (privileged) {
            const grantQuery = `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${config.user}'@'%'; GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${config.user}'@'localhost'; FLUSH PRIVILEGES;`;
            await execFileAsync(getMysqlCommand(), [...args, '-e', grantQuery], { env });
            logs.push(`Permissions granted for '${dbName}'.`);
       }
    } catch(e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logs.push(`Warning ensures DB '${dbName}': ${message}`);
    }
}

export async function test(config: MySQLConfig): Promise<{ success: boolean; message: string; version?: string }> {
    if (isSSHMode(config)) {
        const sshConfig = extractSshConfig(config)!;
        const ssh = new SshClient();
        try {
            await ssh.connect(sshConfig);

            // Detect available binaries on remote
            const mysqlBin = await remoteBinaryCheck(ssh, "mariadb", "mysql");
            const mysqladminBin = await remoteBinaryCheck(ssh, "mariadb-admin", "mysqladmin");

            const args = buildMysqlArgs(config);
            const env: Record<string, string | undefined> = {};
            if (config.password) env.MYSQL_PWD = config.password;

            // 1. Ping test
            const pingCmd = remoteEnv(env, `${mysqladminBin} ping ${args.join(" ")} --connect-timeout=10`);
            const pingResult = await ssh.exec(pingCmd);
            if (pingResult.code !== 0) {
                return { success: false, message: `SSH ping failed: ${pingResult.stderr}` };
            }

            // 2. Version check
            const versionCmd = remoteEnv(env, `${mysqlBin} ${args.join(" ")} -N -s -e 'SELECT VERSION()'`);
            const versionResult = await ssh.exec(versionCmd);
            if (versionResult.code !== 0) {
                return { success: true, message: "Connection successful (via SSH, version unknown)" };
            }

            const rawVersion = versionResult.stdout.trim();
            const versionMatch = rawVersion.match(/^([\d.]+)/);
            const version = versionMatch ? versionMatch[1] : rawVersion;

            return { success: true, message: "Connection successful (via SSH)", version };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, message: `SSH connection failed: ${msg}` };
        } finally {
            ssh.end();
        }
    }

    try {
        // 1. Basic Ping Test
        // Increased timeout to 10s to handle heavy load during integration tests
        const pingArgs = ['ping', '-h', config.host, '-P', String(config.port), '-u', config.user, '--protocol=tcp', '--connect-timeout=10'];

        // Use MYSQL_PWD env var for password to avoid leaking it in process list
        const env = { ...process.env };
        if (config.password) {
            env.MYSQL_PWD = config.password;
        }

        if (config.disableSsl) {
            pingArgs.push('--skip-ssl');
        }

        await execFileAsync(getMysqladminCommand(), pingArgs, { env });

        // 2. Version Check (if ping successful)
        const versionArgs = ['-h', config.host, '-P', String(config.port), '-u', config.user, '--protocol=tcp', '-N', '-s', '-e', 'SELECT VERSION()'];

        if (config.disableSsl) {
            versionArgs.push('--skip-ssl');
        }

        const { stdout } = await execFileAsync(getMysqlCommand(), versionArgs, { env });
        const rawVersion = stdout.trim();

        // Extract version number only (e.g. "11.4.9-MariaDB-ubu2404" → "11.4.9" or "8.0.44" → "8.0.44")
        const versionMatch = rawVersion.match(/^([\d.]+)/);
        const version = versionMatch ? versionMatch[1] : rawVersion;

        return { success: true, message: "Connection successful", version };
    } catch (error: unknown) {
        const err = error as { stderr?: string; message?: string };
        return { success: false, message: "Connection failed: " + (err.stderr || err.message) };
    }
}

export async function getDatabases(config: MySQLConfig): Promise<string[]> {
    const sysDbs = ['information_schema', 'mysql', 'performance_schema', 'sys'];

    if (isSSHMode(config)) {
        const sshConfig = extractSshConfig(config)!;
        const ssh = new SshClient();
        try {
            await ssh.connect(sshConfig);
            const mysqlBin = await remoteBinaryCheck(ssh, "mariadb", "mysql");
            const args = buildMysqlArgs(config);
            const env: Record<string, string | undefined> = {};
            if (config.password) env.MYSQL_PWD = config.password;

            const cmd = remoteEnv(env, `${mysqlBin} ${args.join(" ")} -e 'SHOW DATABASES' --skip-column-names`);
            const result = await ssh.exec(cmd);
            if (result.code !== 0) {
                throw new Error(`Failed to list databases: ${result.stderr}`);
            }
            return result.stdout.split('\n').map(s => s.trim()).filter(s => s && !sysDbs.includes(s));
        } finally {
            ssh.end();
        }
    }

    const args = ['-h', config.host, '-P', String(config.port), '-u', config.user, '--protocol=tcp'];
    if (config.disableSsl) {
        args.push('--skip-ssl');
    }

    // Use MYSQL_PWD env var for password
    const env = { ...process.env };
    if (config.password) {
        env.MYSQL_PWD = config.password;
    }

    args.push('-e', 'SHOW DATABASES', '--skip-column-names');

    const { stdout } = await execFileAsync(getMysqlCommand(), args, { env });
    return stdout.split('\n').map(s => s.trim()).filter(s => s && !sysDbs.includes(s));
}

import { DatabaseInfo } from "@/lib/core/interfaces";

const statsQuery = `
    SELECT
        s.schema_name AS db_name,
        COALESCE(SUM(t.data_length + t.index_length), 0) AS size_bytes,
        COUNT(t.table_name) AS table_count
    FROM information_schema.schemata s
    LEFT JOIN information_schema.tables t ON s.schema_name = t.table_schema
    WHERE s.schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    GROUP BY s.schema_name
    ORDER BY s.schema_name;
`.trim();

function parseStatsOutput(stdout: string): DatabaseInfo[] {
    return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => {
            const [name, sizeStr, tableStr] = line.split('\t');
            return {
                name,
                sizeInBytes: parseInt(sizeStr, 10) || 0,
                tableCount: parseInt(tableStr, 10) || 0,
            };
        });
}

export async function getDatabasesWithStats(config: MySQLConfig): Promise<DatabaseInfo[]> {
    if (isSSHMode(config)) {
        const sshConfig = extractSshConfig(config)!;
        const ssh = new SshClient();
        try {
            await ssh.connect(sshConfig);
            const mysqlBin = await remoteBinaryCheck(ssh, "mariadb", "mysql");
            const args = buildMysqlArgs(config);
            const env: Record<string, string | undefined> = {};
            if (config.password) env.MYSQL_PWD = config.password;

            const cmd = remoteEnv(env, `${mysqlBin} ${args.join(" ")} -e ${shellEscape(statsQuery)} --skip-column-names --batch`);
            const result = await ssh.exec(cmd);
            if (result.code !== 0) {
                throw new Error(`Failed to get database stats: ${result.stderr}`);
            }
            return parseStatsOutput(result.stdout);
        } finally {
            ssh.end();
        }
    }

    const args = ['-h', config.host, '-P', String(config.port), '-u', config.user, '--protocol=tcp'];
    if (config.disableSsl) {
        args.push('--skip-ssl');
    }

    const env = { ...process.env };
    if (config.password) {
        env.MYSQL_PWD = config.password;
    }

    args.push('-e', statsQuery, '--skip-column-names', '--batch');

    const { stdout } = await execFileAsync(getMysqlCommand(), args, { env });
    return parseStatsOutput(stdout);
}
