import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/access-control";

export async function GET() {
    const ctx = await getAuthContext(await headers());
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tzSetting = await prisma.systemSetting.findUnique({ where: { key: "system.timezone" } });
    const schedulerTimezone = tzSetting?.value || "UTC";

    return NextResponse.json({ schedulerTimezone });
}
