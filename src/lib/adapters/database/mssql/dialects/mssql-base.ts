import { MSSQLDatabaseDialect } from "./index";

/**
 * Escapes a string for safe inclusion in a T-SQL N'...' literal.
 * Replaces single quotes with doubled single quotes (SQL standard escaping).
 */
function escapeTSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Validates and sanitizes a database name for use in T-SQL [brackets].
 * Rejects names with characters that could break out of bracket quoting.
 */
function validateDatabaseName(name: string): string {
    // MSSQL identifiers inside brackets: only ] needs to be escaped as ]]
    // But we also reject obviously dangerous patterns as defense-in-depth
    if (!name || name.length > 128) {
        throw new Error(`Invalid database name: name must be 1-128 characters`);
    }
    // Escape closing brackets for safe bracket-quoting
    return name.replace(/\]/g, "]]");
}

/**
 * Base MSSQL Dialect for SQL Server 2019+
 * Supports native backup compression and modern features
 */
export class MSSQLDialect implements MSSQLDatabaseDialect {
    /**
     * Generate T-SQL BACKUP DATABASE statement
     */
    getBackupQuery(
        database: string,
        backupPath: string,
        options?: {
            compression?: boolean;
            stats?: number;
            copyOnly?: boolean;
        }
    ): string {
        const opts = options || {};
        const withClauses: string[] = ["FORMAT", "INIT"];

        // Compression enabled by default (caller should check edition support first)
        // Only skip if explicitly set to false
        if (opts.compression !== false) {
            withClauses.push("COMPRESSION");
        }

        // Progress reporting
        if (opts.stats) {
            withClauses.push(`STATS = ${opts.stats}`);
        }

        // Copy-only backup (doesn't affect backup chain)
        if (opts.copyOnly) {
            withClauses.push("COPY_ONLY");
        }

        // Add descriptive name
        withClauses.push(`NAME = N'${escapeTSqlString(database)}-Full Database Backup'`);

        return `BACKUP DATABASE [${validateDatabaseName(database)}] TO DISK = N'${escapeTSqlString(backupPath)}' WITH ${withClauses.join(", ")}`;
    }

    /**
     * Generate T-SQL RESTORE DATABASE statement
     */
    getRestoreQuery(
        database: string,
        backupPath: string,
        options?: {
            replace?: boolean;
            recovery?: boolean;
            stats?: number;
            moveFiles?: { logicalName: string; physicalPath: string }[];
        }
    ): string {
        const opts = options || {};
        const withClauses: string[] = [];

        // Replace existing database
        if (opts.replace) {
            withClauses.push("REPLACE");
        }

        // Recovery mode
        if (opts.recovery !== false) {
            withClauses.push("RECOVERY");
        } else {
            withClauses.push("NORECOVERY");
        }

        // Progress reporting
        if (opts.stats) {
            withClauses.push(`STATS = ${opts.stats}`);
        }

        // File relocation (for restoring to different database name)
        if (opts.moveFiles && opts.moveFiles.length > 0) {
            for (const file of opts.moveFiles) {
                withClauses.push(`MOVE N'${escapeTSqlString(file.logicalName)}' TO N'${escapeTSqlString(file.physicalPath)}'`);
            }
        }

        const withClause = withClauses.length > 0 ? ` WITH ${withClauses.join(", ")}` : "";
        return `RESTORE DATABASE [${validateDatabaseName(database)}] FROM DISK = N'${escapeTSqlString(backupPath)}'${withClause}`;
    }

    /**
     * Check version support
     */
    supportsVersion(version: string): boolean {
        const majorVersion = parseInt(version.split(".")[0], 10);
        return majorVersion >= 15; // SQL Server 2019+
    }
}
