-- ============================================================
-- Migration 055: Adiciona subdivisions.notes
-- ============================================================
-- Coluna já existia em produção (criada direto no painel do Supabase
-- em algum momento — mesmo padrão de drift já visto várias vezes nesta
-- sessão). A trigger tr_clear_notes_on_completion (019) já assumia sua
-- existência há tempo; só nunca tinha sido capturada numa migration.
-- ============================================================

ALTER TABLE public.subdivisions ADD COLUMN IF NOT EXISTS notes TEXT;
