import { SshClient, SshConnectionConfig } from "./ssh-client";

/**
 * Escapes a value for safe inclusion in a single-quoted shell string.
 * Handles embedded single quotes by ending the quote, adding an escaped quote, and re-opening.
 */
export function shellEscape(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Build a remote command string with environment variables exported before execution.
 * Uses `export` statements separated by `;` so that if the main process is killed,
 * bash's kill report only shows the command — not the secrets.
 *
 * Example: remoteEnv({ MYSQL_PWD: "secret" }, "mysqldump -h 127.0.0.1 mydb")
 *   → "export MYSQL_PWD='secret'; mysqldump -h 127.0.0.1 mydb"
 */
export function remoteEnv(vars: Record<string, string | undefined>, command: string): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(vars)) {
        if (value !== undefined && value !== "") {
            parts.push(`export ${key}=${shellEscape(value)}`);
        }
    }
    if (parts.length === 0) return command;
    return `${parts.join("; ")}; ${command}`;
}

/**
 * Check if a binary is available on the remote server.
 * Returns the resolved path or throws if not found.
 */
export async function remoteBinaryCheck(
    client: SshClient,
    ...candidates: string[]
): Promise<string> {
    for (const binary of candidates) {
        const result = await client.exec(`command -v ${shellEscape(binary)} 2>/dev/null`);
        if (result.code === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    }
    throw new Error(
        `Required binary not found on remote server. Tried: ${candidates.join(", ")}`
    );
}

/**
 * Check if an adapter config has SSH mode enabled.
 * Works for configs with `connectionMode: "ssh"` field.
 */
export function isSSHMode(config: Record<string, any>): boolean {
    return config.connectionMode === "ssh";
}

/**
 * Extract SSH connection config from an adapter config that uses
 * the shared sshHost/sshPort/sshUsername/... field convention.
 * Returns null if SSH mode is not enabled.
 */
export function extractSshConfig(config: Record<string, any>): SshConnectionConfig | null {
    if (!isSSHMode(config)) return null;
    if (!config.sshHost || !config.sshUsername) return null;

    return {
        host: config.sshHost,
        port: config.sshPort ?? 22,
        username: config.sshUsername,
        authType: config.sshAuthType ?? "password",
        password: config.sshPassword,
        privateKey: config.sshPrivateKey,
        passphrase: config.sshPassphrase,
    };
}

/**
 * Extract SSH connection config from a SQLite adapter config.
 * SQLite uses direct field names (host, username, etc.) instead of the sshHost prefix convention.
 */
export function extractSqliteSshConfig(config: Record<string, any>): SshConnectionConfig | null {
    if (config.mode !== "ssh") return null;
    if (!config.host || !config.username) return null;

    return {
        host: config.host,
        port: config.port ?? 22,
        username: config.username,
        authType: config.authType ?? "password",
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
    };
}

/**
 * Build MySQL/MariaDB connection arguments for remote execution.
 * Uses the DB host/port from the adapter config (connection within the SSH session).
 */
export function buildMysqlArgs(config: Record<string, any>, user?: string): string[] {
    const args = [
        "-h", shellEscape(config.host || "127.0.0.1"),
        "-P", String(config.port || 3306),
        "-u", shellEscape(user || config.user),
        "--protocol=tcp",
    ];
    if (config.disableSsl) {
        args.push("--skip-ssl");
    }
    return args;
}

/**
 * Build PostgreSQL connection arguments for remote execution.
 */
export function buildPsqlArgs(config: Record<string, any>, user?: string): string[] {
    return [
        "-h", shellEscape(config.host || "127.0.0.1"),
        "-p", String(config.port || 5432),
        "-U", shellEscape(user || config.user),
    ];
}

/**
 * Build MongoDB connection arguments for remote execution via mongosh/mongodump/mongorestore.
 */
export function buildMongoArgs(config: Record<string, any>): string[] {
    if (config.uri) {
        return [`--uri=${shellEscape(config.uri)}`];
    }

    const args = [
        "--host", shellEscape(config.host || "127.0.0.1"),
        "--port", String(config.port || 27017),
    ];

    if (config.user && config.password) {
        args.push("--username", shellEscape(config.user));
        args.push("--password", shellEscape(config.password));
        args.push("--authenticationDatabase", shellEscape(config.authenticationDatabase || "admin"));
    }

    return args;
}

/**
 * Build Redis connection arguments for remote execution.
 */
export function buildRedisArgs(config: Record<string, any>): string[] {
    const args = [
        "-h", shellEscape(config.host || "127.0.0.1"),
        "-p", String(config.port || 6379),
    ];

    if (config.username) {
        args.push("--user", shellEscape(config.username));
    }
    if (config.password) {
        args.push("-a", shellEscape(config.password));
    }
    if (config.tls) {
        args.push("--tls");
    }
    if (config.database !== undefined && config.database !== 0) {
        args.push("-n", String(config.database));
    }

    return args;
}
