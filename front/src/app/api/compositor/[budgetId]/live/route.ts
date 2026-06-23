import { Surreal, Table } from "surrealdb";
import type { LiveSubscription } from "surrealdb";
import { NextRequest, NextResponse } from "next/server";
import { requireSurrealPassword } from "@/lib/surreal-env";
import { requireApiSession } from "@/lib/api-session";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";

export const dynamic = "force-dynamic";

function getWsEndpoint(): string {
  if (process.env.SURREAL_URL) {
    return process.env.SURREAL_URL
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");
  }
  const host = process.env.SURREALDB_HOST || "127.0.0.1";
  const port = process.env.SURREALDB_PORT || "8000";
  return `ws://${host}:${port}`;
}

const namespace = process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database = process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username = process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ budgetId: string }> }
) {
  const session = await requireApiSession(req);
  if (!session.ok) return session.response;

  const { budgetId } = await params;
  const gate = await assertBudgetInActiveTenant(budgetId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // client disconnected
        }
      };

      const db = new Surreal();
      let password: string;
      try {
        password = requireSurrealPassword();
      } catch {
        console.error("[SSE] SURREALDB_PASS / SURREAL_PASS não configurado");
        controller.close();
        return;
      }
      try {
        await db.connect(getWsEndpoint(), {
          namespace,
          database,
          authentication: { username, password },
        });
      } catch (e) {
        console.error("[SSE] Falha ao conectar ao SurrealDB via WebSocket:", e);
        controller.close();
        return;
      }

      let sub1: LiveSubscription | undefined;
      let sub2: LiveSubscription | undefined;

      try {
        sub1 = await db.live(new Table("budget_block"));
        sub1.subscribe((msg) => {
          try {
            const rec = msg.value as Record<string, unknown>;
            const bid = String(rec?.budget_id ?? "");
            if (!bid.includes(budgetId)) return;
            send(JSON.stringify({ type: "block", action: msg.action }));
          } catch {
            // ignore
          }
        });
      } catch (e) {
        console.error("[SSE] Falha ao abrir LIVE SELECT budget_block:", e);
      }

      try {
        sub2 = await db.live(new Table("budget_item"));
        sub2.subscribe((msg) => {
          try {
            const rec = msg.value as Record<string, unknown>;
            const bid =
              String(rec?.budget_id ?? "") ||
              String((rec?.block_id as Record<string, unknown> | undefined)?.budget_id ?? "") ||
              String(
                (
                  (rec?.section_id as Record<string, unknown> | undefined)?.location_id as
                    | Record<string, unknown>
                    | undefined
                )?.budget_id ?? ""
              );
            if (bid && !bid.includes(budgetId)) return;
            send(JSON.stringify({ type: "item", action: msg.action }));
          } catch {
            // ignore
          }
        });
      } catch (e) {
        console.error("[SSE] Falha ao abrir LIVE SELECT budget_item:", e);
      }

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      const cleanup = async () => {
        clearInterval(keepalive);
        try { if (sub1) await sub1.kill(); } catch { /* ignore */ }
        try { if (sub2) await sub2.kill(); } catch { /* ignore */ }
        try { await db.close(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
