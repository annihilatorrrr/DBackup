import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";
import { MssqlSshTransfer } from "@/lib/adapters/database/mssql/ssh-transfer";
import { MSSQLConfig } from "@/lib/adapters/definitions";
import { SshClient } from "@/lib/ssh";
import { extractSshConfig } from "@/lib/ssh";
import { logger } from "@/lib/logger";
import { wrapError } from "@/lib/errors";

const log = logger.child({ route: "adapters/test-ssh" });

export async function POST(req: NextRequest) {
    const ctx = await getAuthContext(await headers());

    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    checkPermissionWithContext(ctx, PERMISSIONS.SOURCES.READ);

    try {
        const body = await req.json();
        const { config } = body as { config: Record<string, any> };

        if (!config) {
            return NextResponse.json(
                { success: false, message: "Missing config" },
                { status: 400 }
            );
        }

        if (!config.sshUsername) {
            return NextResponse.json(
                { success: false, message: "SSH username is required" },
                { status: 400 }
            );
        }

        const sshHost = config.sshHost || config.host;
        const sshPort = config.sshPort || 22;

        // MSSQL uses SFTP-based SSH test (backup path check)
        if (config.fileTransferMode === "ssh") {
            return testMssqlSsh(config as MSSQLConfig, sshHost, sshPort);
        }

        // Generic SSH connection test for all other adapters
        return testGenericSsh(config, sshHost, sshPort);
    } catch (error: unknown) {
        log.error("SSH test route error", {}, wrapError(error));
        const message =
            error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { success: false, message },
            { status: 500 }
        );
    }
}

/**
 * Generic SSH test: connect and run a simple echo command.
 */
async function testGenericSsh(config: Record<string, any>, sshHost: string, sshPort: number) {
    const sshConfig = extractSshConfig({ ...config, connectionMode: "ssh" });
    if (!sshConfig) {
        return NextResponse.json(
            { success: false, message: "Invalid SSH configuration" },
            { status: 400 }
        );
    }

    const ssh = new SshClient();
    try {
        await ssh.connect(sshConfig);
        const result = await ssh.exec("echo connected");

        if (result.code === 0) {
            return NextResponse.json({
                success: true,
                message: `SSH connection to ${sshHost}:${sshPort} successful`,
            });
        }

        return NextResponse.json({
            success: false,
            message: `SSH connected but test command failed: ${result.stderr}`,
        });
    } catch (connectError: unknown) {
        const message =
            connectError instanceof Error
                ? connectError.message
                : "SSH connection failed";
        log.warn("SSH test failed", { sshHost }, wrapError(connectError));
        return NextResponse.json({ success: false, message });
    } finally {
        ssh.end();
    }
}

/**
 * MSSQL-specific SSH test: SFTP connect + backup path check.
 */
async function testMssqlSsh(config: MSSQLConfig, sshHost: string, sshPort: number) {
    const sshTransfer = new MssqlSshTransfer();

    try {
        await sshTransfer.connect(config);

        const backupPath = config.backupPath || "/var/opt/mssql/backup";
        const pathResult = await sshTransfer.testBackupPath(backupPath);

        sshTransfer.end();

        if (!pathResult.readable) {
            return NextResponse.json({
                success: false,
                message: `SSH connection to ${sshHost}:${sshPort} successful, but backup path is not accessible: ${backupPath}`,
            });
        }

        if (!pathResult.writable) {
            return NextResponse.json({
                success: false,
                message: `SSH connection to ${sshHost}:${sshPort} successful, but backup path is read-only: ${backupPath}`,
            });
        }

        return NextResponse.json({
            success: true,
            message: `SSH connection to ${sshHost}:${sshPort} successful - backup path ${backupPath} is readable and writable`,
        });
    } catch (connectError: unknown) {
        sshTransfer.end();
        const message =
            connectError instanceof Error
                ? connectError.message
                : "SSH connection failed";

        log.warn("SSH test failed", { sshHost }, wrapError(connectError));

        return NextResponse.json({
            success: false,
            message,
        });
    }
}
