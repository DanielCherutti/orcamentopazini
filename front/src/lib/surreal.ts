
import { Surreal } from "surrealdb";
import { requireSurrealPassword } from "@/lib/surreal-env";

// Suporta SURREAL_URL ou SURREALDB_HOST+SURREALDB_PORT
const host = process.env.SURREALDB_HOST || "127.0.0.1";
const port = process.env.SURREALDB_PORT || "8000";
const endpoint = process.env.SURREAL_URL || `http://${host}:${port}`;
const namespace = process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database = process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username = process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";

// Reconecta proativamente antes do token expirar (SurrealDB default TTL = 1h)
const MAX_CONNECTION_AGE_MS = 50 * 60 * 1000; // 50 minutos

// Singleton connection
let db: Surreal | null = null;
let dbReady: Promise<Surreal> | null = null;
let dbConnectedAt = 0;
let dbValidatedAt = 0;
let dbInitialized = false;
const HEALTHCHECK_INTERVAL_MS = 30_000;

/** Detecta erros de token expirado, 401 ou falha de autenticação HTTP do cliente SurrealDB */
export function isTokenExpiredError(error: unknown): boolean {
    if (error && typeof error === "object") {
        const e = error as { status?: number; message?: string; name?: string };
        if (e.status === 401) return true;
        const msg = typeof e.message === "string" ? e.message : "";
        const msgLc = msg.toLowerCase();
        if (
            msgLc.includes("token has expired") ||
            msgLc.includes("token expired") ||
            msgLc.includes("unauthorized") ||
            msgLc.includes("problem with authentication")
        ) {
            return true;
        }
        if (
            e.name === "HttpConnectionError" &&
            msg.length > 0 &&
            /authentication|unauthorized|401|token has expired|token expired/i.test(msg)
        ) {
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
        if (
            typeof e.message === "string" &&
            /token has expired|token expired|no active socket|disconnected/i.test(e.message)
        ) {
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
    dbValidatedAt = 0;
    dbInitialized = false;
}

/** Erros de token expirado, auth HTTP ou socket inativo — candidatos a reconexão */
export function isRecoverableDbError(error: unknown): boolean {
    return isTokenExpiredError(error) || isDbConnectionError(error);
}

/** Executa operação no SurrealDB; em falha recuperável, reconecta e tenta uma vez */
export async function withDbRetry<T>(operation: (db: Surreal) => Promise<T>): Promise<T> {
    try {
        const db = await getDb();
        return await operation(db);
    } catch (error) {
        if (!isRecoverableDbError(error)) throw error;
        resetDb();
        const db = await getDb();
        return await operation(db);
    }
}

async function ensureLiveConnection(instance: Surreal): Promise<boolean> {
    try {
        await instance.query("RETURN 1");
        dbValidatedAt = Date.now();
        return true;
    } catch (error) {
        if (isTokenExpiredError(error) || isDbConnectionError(error)) {
            return false;
        }
        throw error;
    }
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
            DEFINE TABLE IF NOT EXISTS modelos SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_block SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_item SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_location SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_section SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_image SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS image_annotation SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS proposal_settings SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS portal_user SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS tenant SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS portal_user_tenant SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS platform_license_settings SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS platform_audit_log SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS platform_charge SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS platform_billing_settings SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS audit_log SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS technical_equipment SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS delivery_project SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS delivery_area SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS delivery_evidence SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS delivery_installation SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS delivery_block SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS databook_template SCHEMALESS;
            DEFINE INDEX IF NOT EXISTS idx_portal_user_email ON portal_user FIELDS email UNIQUE;
            DEFINE INDEX IF NOT EXISTS idx_delivery_project_budget ON delivery_project FIELDS budget_id;
            DEFINE INDEX IF NOT EXISTS idx_delivery_area_project ON delivery_area FIELDS delivery_project_id;
            DEFINE INDEX IF NOT EXISTS idx_databook_template_tenant ON databook_template FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_tenant_slug ON tenant FIELDS slug UNIQUE;
            DEFINE INDEX IF NOT EXISTS idx_tenant_subdomain ON tenant FIELDS subdomain;
            DEFINE INDEX IF NOT EXISTS idx_tenant_custom_domain ON tenant FIELDS custom_domain;
            DEFINE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_log FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_platform_audit_at ON platform_audit_log FIELDS created_at;
            DEFINE INDEX IF NOT EXISTS idx_platform_charge_tenant ON platform_charge FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_platform_charge_asaas ON platform_charge FIELDS asaas_payment_id;
            DEFINE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log FIELDS created_at;
            DEFINE INDEX IF NOT EXISTS idx_portal_user_tenant_user ON portal_user_tenant FIELDS user_id;
            DEFINE INDEX IF NOT EXISTS idx_portal_user_tenant_tenant ON portal_user_tenant FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_product_tenant ON product FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_client_tenant ON client FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_modelos_tenant ON modelos FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_modelos_tipo ON modelos FIELDS tipo;
            DEFINE INDEX IF NOT EXISTS idx_budget_tenant ON budget FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_image_library_tenant ON image_library FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_proposal_settings_tenant ON proposal_settings FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_item_budget_id ON budget_item FIELDS budget_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_item_section_id ON budget_item FIELDS section_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_section_location_id ON budget_section FIELDS location_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_location_budget_id ON budget_location FIELDS budget_id;
            INSERT IGNORE INTO company { id: company:0, name: 'Pazini', created_at: time::now() };
            INSERT IGNORE INTO tenant { id: tenant:pazini, name: 'Pazini', slug: 'pazini', active: true, created_at: time::now() };
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

    // Se já existe instância válida e não há conexão pendente, valida (janela curta) e devolve.
    if (db) {
        const recentlyValidated = Date.now() - dbValidatedAt < HEALTHCHECK_INTERVAL_MS;
        if (recentlyValidated) return db;
        const live = await ensureLiveConnection(db);
        if (live) return db;
        console.warn("SurrealDB: conexão inválida/expirada, reconectando...");
        resetDb();
    }

    const instance = new Surreal();
    db = instance;

    // Connect and Auth for WebSocket/HTTP RPC
    const connectingPromise = (async () => {
        const password = requireSurrealPassword();
        console.log(`Connecting to SurrealDB at ${endpoint}...`);
        await instance.connect(endpoint, {
            namespace,
            database,
            authentication: { username, password }
        });
        dbConnectedAt = Date.now();
        dbValidatedAt = dbConnectedAt;
        console.log("SurrealDB connected successfully.");
        await ensureSchema(instance);
        return instance;
    })().catch((e) => {
        console.error("SurrealDB connection failed:", e);
        // Evita ficar com singleton "meio conectado" (causa NoActiveSocket).
        if (db === instance) {
            db = null;
            dbConnectedAt = 0;
            dbValidatedAt = 0;
        }
        throw e;
    }).finally(() => {
        // Quando termina (com sucesso ou erro), limpamos o marcador de "conectando".
        // Em caso de sucesso, `db` permanece setado.
        if (dbReady === connectingPromise) {
            dbReady = null;
        }
    });

    dbReady = connectingPromise;
    return connectingPromise;
};
