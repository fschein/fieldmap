-- ============================================================
-- Migration 052: Adiciona profiles.gender
-- ============================================================
-- Coluna já existia em produção (criada direto no painel do Supabase
-- em algum momento — mesmo padrão de drift de 'delivered_at', 'groups',
-- 'profiles_role_check' e 'full_name'/'name' encontrados nesta sessão).
-- App code (app/dashboard/users, app/api/admin/create-user,
-- app/api/admin/sync-users) já assume essa coluna há tempo; só nunca
-- tinha sido capturada numa migration.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'M' CHECK (gender IN ('M', 'F'));
