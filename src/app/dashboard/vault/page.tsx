import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserPermissions } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";
import { EncryptionProfilesList } from "@/components/settings/encryption-profiles-list";
import { CredentialProfilesList } from "@/components/settings/credential-profiles-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function VaultPage() {
    const headersList = await headers();
    const session = await auth.api.getSession({
        headers: headersList
    });

    if (!session) {
        redirect("/login");
    }

    const permissions = await getUserPermissions();
    if (!permissions.includes(PERMISSIONS.VAULT.READ)) {
        redirect("/dashboard");
    }

    const canManageCredentials = permissions.includes(PERMISSIONS.CREDENTIALS.READ);
    const canRevealCredentials = permissions.includes(PERMISSIONS.CREDENTIALS.REVEAL);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Security Vault</h2>
                    <p className="text-muted-foreground">Manage encryption keys and reusable credential profiles for your adapters.</p>
                </div>
            </div>

            <Tabs defaultValue={canManageCredentials ? "credentials" : "encryption"} className="w-full">
                <TabsList>
                    {canManageCredentials && (
                        <TabsTrigger value="credentials">Credentials</TabsTrigger>
                    )}
                    <TabsTrigger value="encryption">Encryption</TabsTrigger>
                </TabsList>

                {canManageCredentials && (
                    <TabsContent value="credentials" className="mt-4">
                        <CredentialProfilesList canReveal={canRevealCredentials} />
                    </TabsContent>
                )}

                <TabsContent value="encryption" className="mt-4">
                    <EncryptionProfilesList />
                </TabsContent>
            </Tabs>
        </div>
    );
}
