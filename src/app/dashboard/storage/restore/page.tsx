import { getUserPermissions } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { RestoreClient } from "./restore-client";

export default async function RestorePage() {
    const permissions = await getUserPermissions();
    const canRestore = permissions.includes(PERMISSIONS.STORAGE.RESTORE);

    if (!canRestore) {
        redirect("/dashboard/storage");
    }

    return <RestoreClient />;
}
