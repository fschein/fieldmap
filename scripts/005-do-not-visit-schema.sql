-- Add do_not_visits table for Option A Pin Mode
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

-- Enable RLS
ALTER TABLE public.do_not_visits ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read
CREATE POLICY "Everyone can read do_not_visits"
ON public.do_not_visits FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policy: Admins/Dirigentes can insert
CREATE POLICY "Admins and dirigentes can insert do_not_visits"
ON public.do_not_visits FOR INSERT
WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
);

-- Policy: Admins/Dirigentes can update
CREATE POLICY "Admins and dirigentes can update do_not_visits"
ON public.do_not_visits FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
);

-- Policy: Admins/Dirigentes can delete
CREATE POLICY "Admins and dirigentes can delete do_not_visits"
ON public.do_not_visits FOR DELETE
USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
);

-- Policy: Publishers can insert for their assigned territories
CREATE POLICY "Publishers can insert do_not_visits for their assignments"
ON public.do_not_visits FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM assignments 
        WHERE territory_id = do_not_visits.territory_id 
        AND user_id = auth.uid() 
        AND status = 'active'
    )
);

-- Note: Publishers can't delete or update to prevent abuse/errors, only add new ones.
