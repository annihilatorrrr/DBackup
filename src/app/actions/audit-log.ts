'use server';

import { auditService } from "@/services/audit-service";
import { checkPermission } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from "@/lib/core/audit-types";
import { logger } from "@/lib/logger";
import { wrapError } from "@/lib/errors";

const log = logger.child({ action: "audit-log" });

/** @no-permission-required — Self-service: any authenticated user can log their own login. */
export async function logLoginSuccess() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session?.user) {
            return; // Not authenticated — nothing to log
        }

        const reqHeaders = await headers();
        const ip = reqHeaders.get("x-forwarded-for")?.split(',')[0] || "unknown";

        await auditService.log(
            session.user.id,
            AUDIT_ACTIONS.LOGIN,
            AUDIT_RESOURCES.AUTH,
            {
               method: "web-ui",
               userAgent: reqHeaders.get("user-agent") || "unknown",
               ipAddress: ip
            }
        );
    } catch (e: unknown) {
        log.error("Failed to log login success", {}, wrapError(e));
    }
}
