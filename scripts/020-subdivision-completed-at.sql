-- Add completed_at column to subdivisions for proper completion timestamp tracking
-- Previously the system used updated_at as a workaround, which was overwritten on any edit.
ALTER TABLE public.subdivisions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
