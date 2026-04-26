import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext, checkPermissionWithContext } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";
import * as credentialService from "@/services/credential-service";
import { auditService } from "@/services/audit-service";
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from "@/lib/core/audit-types";
import { ConflictError, NotFoundError, ValidationError, wrapError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "credentials/[id]" });

const UpdateCredentialSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    data: z.unknown().optional(),
});

function errorResponse(error: unknown): NextResponse {
    if (error instanceof ValidationError) {
        return NextResponse.json(
            { error: error.message, details: error.details },
            { status: 400 }
        );
    }
    if (error instanceof ConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 404 });
    }
    log.error("Unexpected error in credentials/[id] route", {}, wrapError(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;
    const ctx = await getAuthContext(await headers());
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.CREDENTIALS.READ);
        const profile = await credentialService.getCredentialProfile(id);
        return NextResponse.json({ success: true, data: profile });
    } catch (e) {
        return errorResponse(e);
    }
}

export async function PUT(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;
    const ctx = await getAuthContext(await headers());
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.CREDENTIALS.WRITE);

        const body = await req.json();
        const parsed = UpdateCredentialSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body", details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const profile = await credentialService.updateCredentialProfile(id, parsed.data);

        await auditService.log(
            ctx.userId,
            AUDIT_ACTIONS.UPDATE,
            AUDIT_RESOURCES.CREDENTIAL,
            { fields: Object.keys(parsed.data) },
            id
        );

        return NextResponse.json({ success: true, data: profile });
    } catch (e) {
        return errorResponse(e);
    }
}

export async function DELETE(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const { id } = await props.params;
    const ctx = await getAuthContext(await headers());
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.CREDENTIALS.DELETE);

        await credentialService.deleteCredentialProfile(id);

        await auditService.log(
            ctx.userId,
            AUDIT_ACTIONS.DELETE,
            AUDIT_RESOURCES.CREDENTIAL,
            {},
            id
        );

        return NextResponse.json({ success: true });
    } catch (e) {
        return errorResponse(e);
    }
}
