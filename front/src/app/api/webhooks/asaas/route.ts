import { NextResponse } from "next/server";

import { syncPlatformChargeFromAsaas } from "@/actions/platform-billing-actions";
import { resolveAsaasConfig } from "@/lib/asaas/config";
import type { AsaasWebhookEvent } from "@/lib/asaas/client";

export async function POST(request: Request) {
    const config = await resolveAsaasConfig();
    if (!config) {
        return NextResponse.json({ error: "Asaas not configured" }, { status: 503 });
    }

    if (config.webhookToken) {
        const token =
            request.headers.get("asaas-access-token") ??
            request.headers.get("x-asaas-token") ??
            "";
        if (token !== config.webhookToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    let body: AsaasWebhookEvent;
    try {
        body = (await request.json()) as AsaasWebhookEvent;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const event = body.event ?? "";
    const paymentId = body.payment?.id;
    if (!paymentId) {
        return NextResponse.json({ ok: true, skipped: true });
    }

    const relevant = [
        "PAYMENT_RECEIVED",
        "PAYMENT_CONFIRMED",
        "PAYMENT_OVERDUE",
        "PAYMENT_DELETED",
        "PAYMENT_REFUNDED",
    ];
    if (!relevant.includes(event)) {
        return NextResponse.json({ ok: true, ignored: event });
    }

    const statusMap: Record<string, string> = {
        PAYMENT_RECEIVED: "RECEIVED",
        PAYMENT_CONFIRMED: "CONFIRMED",
        PAYMENT_OVERDUE: "OVERDUE",
        PAYMENT_DELETED: "DELETED",
        PAYMENT_REFUNDED: "REFUNDED",
    };

    try {
        const result = await syncPlatformChargeFromAsaas(paymentId, statusMap[event]);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("asaas webhook:", error);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
