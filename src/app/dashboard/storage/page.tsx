
import { Suspense } from "react";
import { StorageClient } from "./storage-client";
import { getUserPermissions } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function StoragePage() {
    const permissions = await getUserPermissions();
    const canDownload = permissions.includes(PERMISSIONS.STORAGE.DOWNLOAD);
    const canRestore = permissions.includes(PERMISSIONS.STORAGE.RESTORE);
    const canDelete = permissions.includes(PERMISSIONS.STORAGE.DELETE);

    return (
        <Suspense>
            <StorageClient canDownload={canDownload} canRestore={canRestore} canDelete={canDelete} />
        </Suspense>
    );
}
