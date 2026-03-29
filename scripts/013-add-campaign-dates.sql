-- ============================================================
-- 013-add-campaign-dates.sql
-- Adiciona colunas de data para as campanhas
-- ============================================================

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS end_date DATE;

-- Comentário para documentação no Supabase
COMMENT ON COLUMN public.campaigns.start_date IS 'Data de início oficial da campanha';
COMMENT ON COLUMN public.campaigns.end_date IS 'Data de término oficial da campanha';
