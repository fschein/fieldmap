-- ============================================================
-- Migration 032: Request Territory (Dirigente)
-- ============================================================
-- Feature: permite que dirigentes peçam um território
-- diretamente pelo dashboard sem intervenção do admin.
--
-- Decisão de design: nenhuma tabela nova é necessária.
-- O registro em `assignments` (status = 'active') já serve
-- como audit trail da auto-designação. O campo `user_id`
-- identifica o dirigente que fez o pedido; não há distinção
-- entre designações feitas pelo admin e pelo próprio dirigente.
--
-- Algoritmo de prioridade (implementado na camada app):
--   1. Nunca trabalhado primeiro (last_completed_at IS NULL)
--   2. Mais antigo (last_completed_at ASC NULLS FIRST)
--   3. Menos repetições nos últimos 6 meses (count de assignments)
-- ============================================================

-- Sem alterações de schema nesta migration.
SELECT 1;
