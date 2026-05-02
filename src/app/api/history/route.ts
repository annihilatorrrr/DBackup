import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(_req: NextRequest) {
    const ctx = await getAuthContext(await headers());
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.HISTORY.READ);

        const [executions, tzSetting] = await Promise.all([
            prisma.execution.findMany({
                include: {
                    job: {
                        select: {
                            name: true,
                        }
                    }
                },
                orderBy: { startedAt: 'desc' },
                take: 100
            }),
            prisma.systemSetting.findUnique({ where: { key: "system.timezone" } })
        ]);

        const systemTimezone = tzSetting?.value || "UTC";

        return NextResponse.json({
            executions,
            systemTimezone
        });
    } catch (_error) {
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}
