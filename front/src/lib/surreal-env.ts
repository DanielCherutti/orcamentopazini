/**
 * Credenciais SurrealDB lidas apenas de variáveis de ambiente.
 * Não há senha (nem outro segredo) embutido no código da aplicação.
 */

/**
 * Senha do SurrealDB. Obrigatória em runtime ao conectar (exceto fases de build estático).
 */
export function requireSurrealPassword(): string {
    const p = (process.env.SURREAL_PASS || process.env.SURREALDB_PASS || "").trim();
    if (!p) {
        throw new Error(
            "Configure SURREALDB_PASS ou SURREAL_PASS no ambiente. Não há valor padrão no código. " +
                "Copie front/.env.example para .env e alinhe com a senha do seu SurrealDB (ex.: docker-compose).",
        );
    }
    return p;
}
