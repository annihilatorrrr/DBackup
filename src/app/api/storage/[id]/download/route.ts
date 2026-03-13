import { NextRequest, NextResponse } from "next/server";
import { registerAdapters } from "@/lib/adapters";
import { storageService } from "@/services/storage-service";
import { getTempDir } from "@/lib/temp-dir";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { wrapError, getErrorMessage } from "@/lib/errors";

const log = logger.child({ route: "storage/download" });
registerAdapters();

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx = await getAuthContext(await headers());

    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await props.params;
    let tempFile: string | null = null;

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.STORAGE.DOWNLOAD);

        const { searchParams } = new URL(req.url);
        const file = searchParams.get("file");
        const decrypt = searchParams.get("decrypt") === "true";

        if (!file || file.includes('..') || file.startsWith('/')) {
             return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
        }

        const tempDir = getTempDir();
        // Use random suffix to avoid collision if multiple downloads happen
        const tempName = `${path.basename(file)}_${Date.now()}`;
        tempFile = path.join(tempDir, tempName);

        // Delegate logic to Service with decrypt flag
        // Note: storageService handles config retrieval, decryption and adapter lookup
        const result = await storageService.downloadFile(params.id, file, tempFile, decrypt);

        if (!result.success) {
             await fsPromises.unlink(tempFile).catch(() => {});
             return NextResponse.json({ error: "Download failed" }, { status: 500 });
        }

        // Stream file back to avoid blocking the event loop with large files
        const stat = await fsPromises.stat(tempFile);

        let downloadFilename = path.basename(file);

        if (result.isZip) {
            downloadFilename = downloadFilename.replace(/\.enc$/, '') + '.zip';
            if (!downloadFilename.endsWith('.zip')) downloadFilename += '.zip';
        } else if (decrypt && downloadFilename.endsWith('.enc')) {
            downloadFilename = downloadFilename.slice(0, -4);
        }

        const fileStream = fs.createReadStream(tempFile);
        const readableStream = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                fileStream.on('end', () => {
                    controller.close();
                    fsPromises.unlink(tempFile!).catch(() => {});
                });
                fileStream.on('error', (err) => {
                    controller.error(err);
                    fsPromises.unlink(tempFile!).catch(() => {});
                });
            }
        });

        return new NextResponse(readableStream, {
            headers: {
                "Content-Disposition": `attachment; filename="${downloadFilename}"`,
                "Content-Type": result.isZip ? "application/zip" : "application/octet-stream",
                "Content-Length": String(stat.size),
            }
        });

    } catch (error: unknown) {
        if (tempFile) {
             await fsPromises.unlink(tempFile).catch(() => {});
        }

        log.error("Download error", { storageId: params.id }, wrapError(error));
         const errorMessage = getErrorMessage(error) || "An unknown error occurred";

         if (errorMessage.includes("not found")) {
             return NextResponse.json({ error: errorMessage }, { status: 404 });
         }

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
