-- Migration: Create schedule management tables
-- Description: Supports automated leader scheduling with frequency and arrangements.

-- 1. Schedule Arrangements (Weekday/Time slots)
CREATE TABLE IF NOT EXISTS public.schedule_arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6), -- 0=Sunday, 1=Monday...
    start_time TIME NOT NULL,
    label TEXT, -- e.g., "Saída de Campo", "Reunião de Meio de Semana"
    is_group_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Leader Arrangements (Leader availability/assignment to slots)
CREATE TABLE IF NOT EXISTS public.leader_arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    arrangement_id UUID NOT NULL REFERENCES public.schedule_arrangements(id) ON DELETE CASCADE,
    frequency INTEGER DEFAULT 2 CHECK (frequency >= 1 AND frequency <= 5), -- Times per month
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, arrangement_id)
);

-- 3. Schedules (The actual instances)
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    arrangement_id UUID NOT NULL REFERENCES public.schedule_arrangements(id) ON DELETE CASCADE,
    leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Nullable for Group Mode
    territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL, -- Auto-selected for Sundays
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'manual')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(date, arrangement_id)
);

-- Enable RLS
ALTER TABLE public.schedule_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for now - Admins manage, others read published)
CREATE POLICY "Public read for schedule_arrangements" ON public.schedule_arrangements
    FOR SELECT USING (true);

CREATE POLICY "Admins manage schedule_arrangements" ON public.schedule_arrangements
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Public read for leader_arrangements" ON public.leader_arrangements
    FOR SELECT USING (true);

CREATE POLICY "Admins manage leader_arrangements" ON public.leader_arrangements
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Read published schedules" ON public.schedules
    FOR SELECT USING (status = 'published' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Admins manage schedules" ON public.schedules
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- Indices
CREATE INDEX IF NOT EXISTS idx_schedules_date ON public.schedules(date);
CREATE INDEX IF NOT EXISTS idx_leader_arrangements_profile ON public.leader_arrangements(profile_id);
CREATE INDEX IF NOT EXISTS idx_leader_arrangements_arr ON public.leader_arrangements(arrangement_id);
