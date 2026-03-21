
import { Surreal } from "surrealdb";

// Suporta SURREAL_URL ou SURREALDB_HOST+SURREALDB_PORT
const host = process.env.SURREALDB_HOST || "127.0.0.1";
const port = process.env.SURREALDB_PORT || "8000";
const endpoint = process.env.SURREAL_URL || `http://${host}:${port}`;
const namespace = process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database = process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username = process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";
const password = process.env.SURREAL_PASS || process.env.SURREALDB_PASS || "q1w2e3r4";

// Reconecta proativamente antes do token expirar (SurrealDB default TTL = 1h)
const MAX_CONNECTION_AGE_MS = 50 * 60 * 1000; // 50 minutos

// Singleton connection
let db: Surreal | null = null;
let dbReady: Promise<Surreal> | null = null;
let dbConnectedAt = 0;
let dbInitialized = false;

/** Detecta erros de token expirado / 401 Unauthorized do SurrealDB */
export function isTokenExpiredError(error: unknown): boolean {
    if (error && typeof error === "object") {
        const e = error as { status?: number; message?: string };
        if (e.status === 401) return true;
        if (typeof e.message === "string" &&
            (e.message.includes("token has expired") || e.message.includes("Unauthorized"))) {
            return true;
        }
    }
    return false;
}

/** Verifica se o erro é de conexão com o banco de dados */
export function isDbConnectionError(error: unknown): boolean {
    if (error && typeof error === "object") {
        const e = error as { status?: number; message?: string; name?: string };
        if (e.name === "HttpConnectionError") return true;
        if (typeof e.message === "string" &&
            e.message.includes("token has expired")) {
            return true;
        }
    }
    return false;
}

/**
 * Serializa objetos SurrealDB (RecordId, DateTime, etc.) para POJOs seguros.
 * Next.js exige plain objects ao passar dados de Server → Client Components.
 * JSON.stringify usa .toJSON() de cada classe; JSON.parse produz plain objects.
 */
export function toPlain<T>(data: T): T {
    return JSON.parse(JSON.stringify(data));
}

/** Reseta o singleton para forçar reconexão na próxima chamada a getDb() */
export function resetDb() {
    db = null;
    dbReady = null;
    dbConnectedAt = 0;
    dbInitialized = false;
}

/**
 * SurrealDB 3.x exige que namespace e database existam antes de qualquer query.
 * Executado uma única vez por processo após a primeira conexão bem-sucedida.
 */
async function ensureSchema(instance: Surreal): Promise<void> {
    if (dbInitialized) return;
    try {
        await instance.query(`
            DEFINE NAMESPACE IF NOT EXISTS \`${namespace}\`;
            USE NAMESPACE \`${namespace}\`;
            DEFINE DATABASE IF NOT EXISTS \`${database}\`;
            USE DATABASE \`${database}\`;
            DEFINE TABLE IF NOT EXISTS company SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product_group SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product_unit SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS image_library SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS client SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_block SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_item SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_location SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_section SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_image SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS image_annotation SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS proposal_settings SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS portal_user SCHEMALESS;
            DEFINE INDEX IF NOT EXISTS idx_portal_user_email ON portal_user FIELDS email UNIQUE;
            INSERT IGNORE INTO company { id: company:0, name: 'Pazini', created_at: time::now() };
        `);
        dbInitialized = true;
        console.log("SurrealDB schema ensured.");
    } catch (e) {
        console.warn("SurrealDB ensureSchema warning (non-fatal):", e);
        // Não bloqueia — banco pode já estar inicializado por outro processo.
        dbInitialized = true;
    }
}

export const getDb = async () => {
    // If building, return a mock/null to avoid connection errors during static analysis of Server Components
    if (process.env.NEXT_PHASE === 'phase-production-build') {
        return new Surreal();
    }

    // Se já existe uma conexão em andamento, aguarda.
    if (dbReady) return dbReady;

    // Reconexão proativa: se a conexão é antiga, reseta para evitar token expirado.
    if (db && Date.now() - dbConnectedAt > MAX_CONNECTION_AGE_MS) {
        console.log("SurrealDB: conexão antiga, reconectando proativamente...");
        db = null;
    }

    // Se já existe instância válida e não há conexão pendente, devolve.
    if (db) return db;

    db = new Surreal();

    // Connect and Auth for WebSocket/HTTP RPC
    dbReady = (async () => {
        console.log(`Connecting to SurrealDB at ${endpoint}...`);
        await db!.connect(endpoint, {
            namespace,
            database,
            authentication: { username, password }
        });
        dbConnectedAt = Date.now();
        console.log("SurrealDB connected successfully.");
        await ensureSchema(db!);
        return db!;
    })().catch((e) => {
        console.error("SurrealDB connection failed:", e);
        // Evita ficar com singleton "meio conectado" (causa NoActiveSocket).
        db = null;
        dbReady = null;
        dbConnectedAt = 0;
        throw e;
    }).finally(() => {
        // Quando termina (com sucesso ou erro), limpamos o marcador de "conectando".
        // Em caso de sucesso, `db` permanece setado.
        dbReady = null;
    });

    return dbReady;
};
