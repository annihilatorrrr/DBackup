import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import * as credentialService from "@/services/auth/credential-service";
import { auditService } from "@/services/audit-service";
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from "@/lib/core/audit-types";
import { NotFoundError, wrapError } from "@/lib/logging/errors";
import { logger } from "@/lib/logging/logger";

const log = logger.child({ route: "credentials/[id]/reveal" });

/**
 * Returns the decrypted credential payload. Highly sensitive: separate
 * `CREDENTIALS.REVEAL` permission required and every call is audited.
 */
export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;
    const ctx = await getAuthContext(await headers());
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.CREDENTIALS.REVEAL);

        // Audit BEFORE returning secrets so reveal is never silent
        await auditService.log(
            ctx.userId,
            AUDIT_ACTIONS.EXPORT,
            AUDIT_RESOURCES.CREDENTIAL,
            { action: "reveal" },
            id
        );

        const profile = await credentialService.getCredentialProfile(id);
        const data = await credentialService.getDecryptedCredentialData(id);

        return NextResponse.json({
            success: true,
            data: {
                id: profile.id,
                name: profile.name,
                type: profile.type,
                payload: data,
            },
        });
    } catch (e) {
        if (e instanceof NotFoundError) {
            return NextResponse.json({ error: e.message }, { status: 404 });
        }
        log.error("Unexpected error in credentials reveal route", {}, wrapError(e));
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
