import { NextResponse } from "next/server";

import { runBillingCycleAction } from "@/actions/platform-billing-actions";

export async function POST(request: Request) {
    const secret = process.env.BILLING_CRON_SECRET?.trim();
    if (secret) {
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    const result = await runBillingCycleAction();
    return NextResponse.json(result);
}
