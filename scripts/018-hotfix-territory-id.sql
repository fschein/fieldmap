-- Run this if territory_id is missing or causing relationship errors
ALTER TABLE public.schedules 
ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL;

-- Ensure the foreign key is properly recognized
COMMENT ON COLUMN public.schedules.territory_id IS 'Auto-selected territory for group mode';
