-- ============================================================
-- Migration 053: Adiciona territories.group_id
-- ============================================================
-- Coluna já existia em produção (criada direto no painel do Supabase
-- em algum momento — mesmo padrão de drift de 'delivered_at', 'groups',
-- 'profiles_role_check', 'name'/'full_name' e 'gender' encontrados
-- nesta sessão). App code (admin-territories-view.tsx,
-- territory-form-modal.tsx, territories/[id]/page.tsx) já assume essa
-- coluna e sua relação com 'groups' há tempo; só nunca tinha sido
-- capturada numa migration.
-- ============================================================

ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_territories_group_id ON public.territories(group_id);
