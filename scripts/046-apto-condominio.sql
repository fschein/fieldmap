-- ============================================================
-- Migration 046: Aptidão para território de condomínio
-- ============================================================
-- Publicador só recebe designação de território tipo 'condominium'
-- (Predial ou Casas) se estiver marcado como apto — treinamento
-- específico necessário antes de acessar a tela de casas.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apto_condominio BOOLEAN NOT NULL DEFAULT false;
