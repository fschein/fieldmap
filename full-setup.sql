-- ============================================================
-- FIELDMAP - FULL DATABASE SETUP
-- Execute este script no SQL Editor do Supabase para configurar
-- todo o banco de dados de uma vez.
-- ============================================================

-- 1. Tabelas Base
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'publicador' CHECK (role IN ('admin', 'dirigente', 'publicador')),
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#C65D3B',
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'completed', 'inactive')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subdivisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  name TEXT,
  geometry JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subdivision_id UUID REFERENCES public.subdivisions(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'returned')),
  notes TEXT,
  return_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.do_not_visits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    territory_id UUID REFERENCES public.territories(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('request', 'returned', 'idle')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_subdivisions_territory_id ON public.subdivisions(territory_id);
CREATE INDEX IF NOT EXISTS idx_assignments_territory_id ON public.assignments(territory_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_territories_status ON public.territories(status);
CREATE INDEX IF NOT EXISTS idx_territories_assigned_to ON public.territories(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assignments_campaign_id ON public.assignments(campaign_id);

-- 3. Funções e Triggers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'publicador'),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de timestamp
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_territories_updated_at BEFORE UPDATE ON public.territories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subdivisions_updated_at BEFORE UPDATE ON public.subdivisions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subdivisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_not_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas de Profiles
CREATE POLICY "Public Read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Self Update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Políticas Gerais (Admin/Dirigente)
-- (Simplificado: Admin/Dirigente podem tudo, Publicador vê tudo e edita suas designações)
CREATE POLICY "Admin All" ON public.territories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
CREATE POLICY "Public Read Terr" ON public.territories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin All Sub" ON public.subdivisions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
CREATE POLICY "Public Read Sub" ON public.subdivisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Publisher Update Sub" ON public.subdivisions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM assignments WHERE territory_id = subdivisions.territory_id AND user_id = auth.uid() AND status = 'active'));

CREATE POLICY "Admin All Ass" ON public.assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
CREATE POLICY "Self Read Ass" ON public.assignments FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admin All DNV" ON public.do_not_visits FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
CREATE POLICY "Public Read DNV" ON public.do_not_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Publisher Insert DNV" ON public.do_not_visits FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM territories WHERE id = do_not_visits.territory_id AND assigned_to = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
