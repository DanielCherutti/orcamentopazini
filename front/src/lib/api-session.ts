import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

/**
 * Garante sessão válida em rotas de API (defesa em profundidade além do proxy).
 */
export async function requireApiSession(request: NextRequest): Promise<
    | { ok: true; email: string }
    | { ok: false; response: NextResponse }
> {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Configuração de sessão inválida" },
                { status: 503 },
            ),
        };
    }

    const raw = request.cookies.get(SESSION_COOKIE)?.value;
    if (!raw) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
        };
    }

    const email = await verifySessionToken(raw, secret);
    if (!email) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Sessão inválida ou expirada" },
                { status: 401 },
            ),
        };
    }

    return { ok: true, email };
}
