-- ============================================================
-- FIELDMAP - VERSÃO CONSOLIDADA (v2025.2)
-- ============================================================
-- 🚀 POST-SETUP (Passos Manuais Necessários):
-- 1. No Supabase, vá em: Authentication -> Settings -> Sign In / Up
--    e DESATIVE "Confirm email" para testar imediatamente.
-- 2. Crie sua conta no App (/signup).
-- 3. No Supabase, vá em: Table Editor -> profiles
--    e mude o seu 'role' de 'publicador' para 'admin'.
-- 4. Pronto! O dashboard administrativo será desbloqueado.
-- ============================================================

-- 1. Tabelas Base e Estrutura Principal

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#2563eb',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'publicador' CHECK (role IN ('admin', 'dirigente', 'publicador', 'supervisor')),
  must_change_password BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  gender TEXT CHECK (gender IN ('M', 'F')),
  last_seen_at TIMESTAMPTZ DEFAULT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que a coluna 'name' existe se o usuário rodar o script em base legada
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='full_name') THEN
    ALTER TABLE public.profiles RENAME COLUMN full_name TO name;
  END IF;
  
  -- Adicionar coluna 'gender' se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='gender') THEN
    ALTER TABLE public.profiles ADD COLUMN gender TEXT CHECK (gender IN ('M', 'F'));
  END IF;
END $$;

-- Garantir colunas novas se a tabela já existia
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_active') THEN
        ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='group_id') THEN
        ALTER TABLE public.profiles ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
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
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir group_id em territories
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='territories' AND column_name='group_id') THEN
        ALTER TABLE public.territories ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subdivisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  name TEXT,
  coordinates JSONB, -- Frontend usa 'coordinates' para GeoJSON ou Array
  notes TEXT,
  order_index INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corrigir nome da coluna se necessário (geometry -> coordinates)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subdivisions' AND column_name='geometry') THEN
        ALTER TABLE public.subdivisions RENAME COLUMN geometry TO coordinates;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subdivisions' AND column_name='coordinates') THEN
        ALTER TABLE public.subdivisions ADD COLUMN coordinates JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subdivisions' AND column_name='notes') THEN
        ALTER TABLE public.subdivisions ADD COLUMN notes TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
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
  type TEXT NOT NULL CHECK (type IN ('request', 'returned', 'idle', 'assigned', 'completed')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Esquema de Escalas (Schedules)

CREATE TABLE IF NOT EXISTS public.schedule_arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
    start_time TIME NOT NULL,
    label TEXT,
    is_group_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leader_arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    arrangement_id UUID NOT NULL REFERENCES public.schedule_arrangements(id) ON DELETE CASCADE,
    frequency INTEGER DEFAULT 2 CHECK (frequency >= 1 AND frequency <= 5),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, arrangement_id)
);

CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    arrangement_id UUID NOT NULL REFERENCES public.schedule_arrangements(id) ON DELETE CASCADE,
    leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'manual')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(date, arrangement_id)
);

-- 3. Índices e Otimização

CREATE INDEX IF NOT EXISTS idx_subdivisions_territory_id ON public.subdivisions(territory_id);
CREATE INDEX IF NOT EXISTS idx_assignments_territory_id ON public.assignments(territory_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_territories_status ON public.territories(status);
CREATE INDEX IF NOT EXISTS idx_territories_assigned_to ON public.territories(assigned_to);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON public.schedules(date);
CREATE INDEX IF NOT EXISTS idx_dnv_territory ON public.do_not_visits(territory_id);

-- 4. Funções e Gatilhos (Automation)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  first_count integer;
BEGIN
  -- Conta quantos perfis já existem para decidir o cargo do primeiro (Onboarding)
  SELECT count(*) FROM public.profiles INTO first_count;

  INSERT INTO public.profiles (id, email, name, role, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN first_count = 0 THEN 'admin'::text 
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'publicador')::text
    END,
    COALESCE(
      (NEW.raw_user_meta_data->>'must_change_password')::boolean, 
      true
    )
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Garante que o cadastro no Auth NUNCA falhe, mesmo que o perfil dê erro
  -- Isso nos permitirá ver o erro nos logs depois se necessário
  RETURN NEW;
END;
$$;

-- Garantir trigger
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Gatilhos de Timestamp Automático
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_territories_updated_at') THEN
    CREATE TRIGGER update_territories_updated_at BEFORE UPDATE ON public.territories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assignments_updated_at') THEN
    CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 5. Segurança (RLS)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subdivisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.do_not_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Políticas Unificadas (DROP and CREATE para garantir atualização)
DO $$ 
BEGIN
    -- Profiles
    DROP POLICY IF EXISTS "Public Read All" ON public.profiles;
    CREATE POLICY "Public Read All" ON public.profiles FOR SELECT TO authenticated USING (true);
    
    DROP POLICY IF EXISTS "Self Update Profile" ON public.profiles;
    CREATE POLICY "Self Update Profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

    -- Admin All Policies
    DROP POLICY IF EXISTS "Admin All Groups" ON public.groups;
    CREATE POLICY "Admin All Groups" ON public.groups FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
    
    DROP POLICY IF EXISTS "Admin All Campaigns" ON public.campaigns;
    CREATE POLICY "Admin All Campaigns" ON public.campaigns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
    
    DROP POLICY IF EXISTS "Admin All Territories" ON public.territories;
    CREATE POLICY "Admin All Territories" ON public.territories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
    
    DROP POLICY IF EXISTS "Admin All Subdivisions" ON public.subdivisions;
    CREATE POLICY "Admin All Subdivisions" ON public.subdivisions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));
    
    DROP POLICY IF EXISTS "Admin All Assignments" ON public.assignments;
    CREATE POLICY "Admin All Assignments" ON public.assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));

    DROP POLICY IF EXISTS "Admin All Schedules" ON public.schedules;
    CREATE POLICY "Admin All Schedules" ON public.schedules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));

    DROP POLICY IF EXISTS "Admin All Arrangements" ON public.schedule_arrangements;
    CREATE POLICY "Admin All Arrangements" ON public.schedule_arrangements FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));

    DROP POLICY IF EXISTS "Admin All Leader Arrangements" ON public.leader_arrangements;
    CREATE POLICY "Admin All Leader Arrangements" ON public.leader_arrangements FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente')));

    -- Reader Policies
    DROP POLICY IF EXISTS "Read All Groups" ON public.groups;
    CREATE POLICY "Read All Groups" ON public.groups FOR SELECT TO authenticated USING (true);
    
    DROP POLICY IF EXISTS "Read All Campaigns" ON public.campaigns;
    CREATE POLICY "Read All Campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
    
    DROP POLICY IF EXISTS "Read All Territories" ON public.territories;
    CREATE POLICY "Read All Territories" ON public.territories FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Read All Subdivisions" ON public.subdivisions;
    CREATE POLICY "Read All Subdivisions" ON public.subdivisions FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Read All Schedules" ON public.schedules;
    CREATE POLICY "Read All Schedules" ON public.schedules FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Read All Arrangements" ON public.schedule_arrangements;
    CREATE POLICY "Read All Arrangements" ON public.schedule_arrangements FOR SELECT TO authenticated USING (true);
    
    DROP POLICY IF EXISTS "Read My Assignments" ON public.assignments;
    CREATE POLICY "Read My Assignments" ON public.assignments FOR SELECT TO authenticated USING (user_id = auth.uid());
END $$;

-- 6. Realtime Configuration
-- (Pode falhar se já existir, então rodamos em blocos protegidos se possível)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'territories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE territories;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
