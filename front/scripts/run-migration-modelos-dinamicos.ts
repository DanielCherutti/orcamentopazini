import { getDb } from "../src/lib/surreal";

export async function run(): Promise<void> {
    const db = await getDb();

    await db.query(`
        DEFINE TABLE IF NOT EXISTS modelos SCHEMALESS;
        DEFINE INDEX IF NOT EXISTS idx_modelos_tenant ON modelos FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_modelos_tipo ON modelos FIELDS tipo;

        UPDATE client
        SET informacoes_adicionais = {}
        WHERE informacoes_adicionais IS NONE OR informacoes_adicionais = NULL;

        UPDATE modelos
        SET tenant_id = tenant:pazini
        WHERE tenant_id IS NONE OR tenant_id = NULL;
    `);

    const result = await db.query<[
        Array<{ total_clientes: number; clientes_normalizados: number }>,
        Array<{ total_modelos: number }>,
        Array<{ orcamentos_sem_cliente: number }>,
    ]>(`
        SELECT count() AS total_clientes,
               count(informacoes_adicionais != NONE) AS clientes_normalizados
        FROM client GROUP ALL;
        SELECT count() AS total_modelos FROM modelos GROUP ALL;
        SELECT count() AS orcamentos_sem_cliente
        FROM budget
        WHERE client_id IS NONE OR client_id = NULL
        GROUP ALL;
    `);

    console.log("Migração Modelos Dinâmicos aplicada.");
    console.log("Clientes:", result[0]?.[0] ?? { total_clientes: 0, clientes_normalizados: 0 });
    console.log("Modelos:", result[1]?.[0] ?? { total_modelos: 0 });
    console.log("Orçamentos legados sem cliente:", result[2]?.[0]?.orcamentos_sem_cliente ?? 0);
}
