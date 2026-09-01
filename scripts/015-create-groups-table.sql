-- ============================================================
-- Cria a tabela groups (organização de territórios por grupo/região)
-- ============================================================
-- Nunca existiu como migration — foi criada direto no painel do
-- Supabase em algum momento antes de 015-add-groups-to-profiles.sql
-- (que já assume sua existência via "REFERENCES public.groups(id)").
-- Reconstruída aqui a partir do que o app espera (lib/types.ts, tipo
-- Group) e do mesmo padrão de policies já usado em campaigns/
-- territories em 001-create-tables.sql (é da mesma época — is_admin()
-- só existe a partir de 043, não pode ser usado aqui ainda).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#044454',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view groups" ON public.groups;
CREATE POLICY "Anyone can view groups" ON public.groups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert groups" ON public.groups;
CREATE POLICY "Admins can insert groups" ON public.groups
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update groups" ON public.groups;
CREATE POLICY "Admins can update groups" ON public.groups
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete groups" ON public.groups;
CREATE POLICY "Admins can delete groups" ON public.groups
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
