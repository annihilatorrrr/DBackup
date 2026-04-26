import { AdapterManager } from "@/components/adapter/adapter-manager";
import { getUserPermissions } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function NotificationsPage() {
    const permissions = await getUserPermissions();
    const canManage = permissions.includes(PERMISSIONS.NOTIFICATIONS.WRITE);

    return (
        <AdapterManager
            type="notification"
            title="Notifications"
            description="Configure channels to receive alerts about your backups."
            canManage={canManage}
            permissions={permissions}
        />
    )
}
