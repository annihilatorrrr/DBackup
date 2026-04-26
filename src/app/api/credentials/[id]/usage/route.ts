import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import * as credentialService from "@/services/credential-service";
import { NotFoundError, wrapError } from "@/lib/logging/errors";
import { logger } from "@/lib/logging/logger";

const log = logger.child({ route: "credentials/[id]/usage" });

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;
    const ctx = await getAuthContext(await headers());
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.CREDENTIALS.READ);
        const usage = await credentialService.getCredentialUsage(id);
        return NextResponse.json({ success: true, data: { count: usage.length, references: usage } });
    } catch (e) {
        if (e instanceof NotFoundError) {
            return NextResponse.json({ error: e.message }, { status: 404 });
        }
        log.error("Unexpected error in credentials usage route", {}, wrapError(e));
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
