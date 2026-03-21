-- Migration: Adicionar Campos de Condições Comerciais à tabela Budget
-- Data: 2026-01-31
-- Descrição: Adiciona campos para condições comerciais (payment_terms, delivery_time, validity_days, issue_date)

-- IMPORTANTE: SurrealDB é schema-less por padrão, então estes campos
-- serão adicionados automaticamente quando os dados forem inseridos.
-- Este arquivo serve apenas como documentação dos campos esperados.

-- =================================================================
-- DEFINIÇÃO DOS CAMPOS (Documentação)
-- =================================================================

-- payment_terms: string
-- Descrição: Condições de pagamento da proposta
-- Default: "30/60/90 dias"
-- Exemplos:
--   - "À Vista (5% desc)"
--   - "30 dias"
--   - "30/60 dias"
--   - "30/60/90 dias"

-- delivery_time: string
-- Descrição: Prazo de entrega dos produtos/serviços
-- Default: "10 dias úteis após aprovação"
-- Exemplos:
--   - "5 dias úteis"
--   - "10 dias corridos"
--   - "15 dias úteis após aprovação do projeto"

-- validity_days: number
-- Descrição: Quantidade de dias que a proposta é válida
-- Default: 15
-- Tipo: inteiro positivo

-- issue_date: datetime (ISO string)
-- Descrição: Data de emissão da proposta
-- Default: data atual no momento da criação
-- Formato: ISO 8601 (ex: "2026-01-31T14:57:00Z")

-- =================================================================
-- VERIFICAÇÃO (Executar no SurrealDB CLI se necessário)
-- =================================================================

-- Verificar se os campos foram adicionados aos registros existentes
-- SELECT payment_terms, delivery_time, validity_days, issue_date FROM budget LIMIT 5;

-- =================================================================
-- ATUALIZAÇÃO DE REGISTROS EXISTENTES (Se necessário)
-- =================================================================

-- Caso existam orçamentos antigos sem esses campos, atualizar com valores default:

-- UPDATE budget SET 
--     payment_terms = "30/60/90 dias",
--     delivery_time = "10 dias úteis após aprovação",
--     validity_days = 15,
--     issue_date = created_at
-- WHERE payment_terms IS NONE;

-- =================================================================
-- VALIDAÇÃO PÓS-MIGRAÇÃO
-- =================================================================

-- Contar quantos registros foram atualizados:
-- SELECT count() FROM budget WHERE payment_terms IS NOT NONE GROUP ALL;

-- Visualizar alguns registros atualizados:
-- SELECT id, code, payment_terms, delivery_time, validity_days, issue_date 
-- FROM budget 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- =================================================================
-- NOTAS
-- =================================================================

-- 1. SurrealDB é schemaless, então não precisa de ALTER TABLE explícito
-- 2. Os campos serão criados automaticamente ao inserir/atualizar registros
-- 3. Validação é feita no backend via Zod schema
-- 4. Valores default são aplicados na camada da aplicação (TypeScript)
