-- ============================================================
-- Migration 054: Ciclo de vida de território por campanha
-- ============================================================
-- Quando uma campanha entra no seu período (start_date chega), os
-- territórios já designados (fora dessa campanha) são liberados pra
-- outra pessoa poder pegar — a designação antiga não é apagada nem
-- devolvida de verdade, só pausada. Quando a campanha termina, essas
-- designações pausadas são retomadas à força, devolvendo o território
-- pro dono original com o mesmo progresso de quadras de antes (que
-- nunca foi tocado, já que progresso durante campanha vai pra
-- subdivision_campaign_progress, não pras colunas de subdivisions).
-- Processado pelo cron em app/api/cron/campaign-lifecycle.
-- ============================================================

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_status_check
  CHECK (status IN ('active', 'completed', 'returned', 'paused'));

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS paused_for_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS territories_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS territories_restored_at TIMESTAMPTZ;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'request', 'returned', 'idle', 'assigned', 'overdue', 'completed',
    'transferred', 'progress_60', 'completed_subdivisions', 'idle_publisher',
    'schedule_checkin', 'schedule_upcoming', 'suggested_edit',
    'campaign_paused', 'campaign_restored'
  ));
