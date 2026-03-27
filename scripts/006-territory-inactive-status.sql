-- Add 'inactive' as a valid territory status to allow territoire management
-- This is additive and won't break existing data

-- First, drop the existing check constraint if it exists and add inactive
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE table_name = 'territories' AND constraint_type = 'CHECK') THEN
    -- If no constraint, the column already accepts any value
    NULL;
  END IF;
END $$;

-- Add inactive support - territories with status 'inactive' are hidden from normal workflow
-- If territories table has a status column with CHECK constraint, update it:
ALTER TABLE territories DROP CONSTRAINT IF EXISTS territories_status_check;
ALTER TABLE territories ADD CONSTRAINT territories_status_check 
  CHECK (status IN ('available', 'assigned', 'completed', 'inactive') OR status IS NULL);

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_territories_status ON territories(status);
