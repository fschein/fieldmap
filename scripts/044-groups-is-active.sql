-- ============================================================
-- Migration 044: Inativar grupo (soft delete)
-- ============================================================
-- Adiciona groups.is_active. Grupos inativos deixam de aparecer
-- nos seletores de "novo trabalho" (pedir território, atribuir
-- por grupo, cadastro de usuário/território), mas territórios e
-- perfis que já referenciam o grupo continuam intactos.
-- ============================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
