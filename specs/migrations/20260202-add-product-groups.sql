-- Migration: Grupos de Produtos
-- Data: 2026-02-02
-- Descrição: Cria tabela product_group e adiciona group_id em product
-- Spec: 20260202120000000-product-groups.spec.md

-- SurrealDB é schema-less por padrão. Este arquivo documenta a estrutura.
-- Execute no SurrealDB CLI se usar SCHEMAFULL.

-- =================================================================
-- TABELA product_group
-- =================================================================

-- DEFINE TABLE product_group SCHEMAFULL;
-- DEFINE FIELD company_id ON product_group TYPE int DEFAULT 0;
-- DEFINE FIELD name ON product_group TYPE string;
-- DEFINE FIELD description ON product_group TYPE option<string>;
-- DEFINE FIELD created_at ON product_group TYPE datetime;
-- DEFINE FIELD updated_at ON product_group TYPE datetime;
-- DEFINE INDEX product_group_name ON product_group FIELDS name;

-- =================================================================
-- CAMPO group_id EM product
-- =================================================================

-- DEFINE FIELD group_id ON product TYPE option<record<product_group>>;
