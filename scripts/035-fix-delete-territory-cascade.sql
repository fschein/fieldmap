-- Migration: Fix delete territory cascade for assignments
-- This fixes the issue where deleting a territory fails with a foreign key violation:
-- "violates foreign key constraint 'assignments_territory_id_fkey' on table 'assignments'"
-- By recreating the constraint with ON DELETE CASCADE, deleting a territory will automatically remove its assignment history.

ALTER TABLE public.assignments 
  DROP CONSTRAINT IF EXISTS assignments_territory_id_fkey,
  ADD CONSTRAINT assignments_territory_id_fkey 
    FOREIGN KEY (territory_id) 
    REFERENCES public.territories(id) 
    ON DELETE CASCADE;
