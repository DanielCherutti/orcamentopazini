-- Migracao: group_id (single) -> group_ids (array) + fix attachments
-- Converte produtos existentes para o novo formato multi-grupo
-- Corrige campo attachments que usava option<array> sem tipo de elemento

-- 1. Definir novo campo group_ids na tabela product (array de strings)
DEFINE FIELD group_ids ON product TYPE option<array<string>> PERMISSIONS FULL;

-- 2. Copiar group_id para group_ids como array (para produtos existentes)
UPDATE product SET group_ids = IF group_id THEN [group_id] ELSE [] END WHERE group_ids = NONE;

-- 3. Corrigir campo attachments: FLEXIBLE TYPE permite objetos com campos arbitrarios
REMOVE FIELD attachments ON product;
DEFINE FIELD attachments ON product FLEXIBLE TYPE option<array> PERMISSIONS FULL;
