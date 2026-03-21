-- Migration: Galeria de Imagens em Locais e Trechos
-- Data: 2026-02-03
-- Descrição: Adiciona location_id e order_index em budget_image; section_id passa a ser opcional
-- Spec: 20260203140000000-budget-image-gallery.spec.md

-- SurrealDB é schema-less por padrão. Este arquivo documenta a estrutura.
-- Para aplicar a migração em bancos existentes:
--   cd front && bun run migrate:20260203

-- =================================================================
-- CAMPOS EM budget_image
-- =================================================================

-- location_id: option<record<budget_location>>
-- Descrição: Local (quando imagem pertence ao local/ambiente)
-- Quando preenchido, section_id deve ser null. Exatamente um dos dois obrigatório.

-- order_index: number
-- Descrição: Ordem de exibição na galeria (default: 0)
-- Imagens existentes: order_index = 0

-- section_id: passa a ser opcional (option<record<budget_section>>)
-- Regra de integridade: exatamente um de section_id ou location_id preenchido

-- =================================================================
-- ATUALIZAÇÃO DE REGISTROS EXISTENTES
-- =================================================================

-- Imagens existentes mantêm section_id; adicionar order_index = 0 e location_id = NONE
-- UPDATE budget_image SET order_index = 0 WHERE order_index IS NONE;
-- UPDATE budget_image SET location_id = NONE WHERE location_id IS NONE;

-- =================================================================
-- ÍNDICES (se SurrealDB suportar para performance)
-- =================================================================

-- Consultas por section_id e location_id já funcionam via WHERE.
-- Índices podem ser adicionados conforme necessidade de performance.
