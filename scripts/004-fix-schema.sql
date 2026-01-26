-- Fix profiles table structure
-- Add missing columns and fix constraints

-- Add full_name column if name exists (rename)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'name') THEN
    ALTER TABLE profiles RENAME COLUMN name TO full_name;
  END IF;
END $$;

-- Add phone column if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update role constraint to accept all three roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'dirigente', 'publicador'));

-- Update default role to 'publicador'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'publicador';

-- Fix subdivisions table - add name column if not exists
ALTER TABLE subdivisions ADD COLUMN IF NOT EXISTS name TEXT;

-- Fix assignments table structure
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS subdivision_id UUID REFERENCES subdivisions(id) ON DELETE CASCADE;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES profiles(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'returned'));

-- Add color to territories
ALTER TABLE territories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3B82F6';
ALTER TABLE territories ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Create index on subdivision_id if not exists
CREATE INDEX IF NOT EXISTS idx_assignments_subdivision_id ON assignments(subdivision_id);

-- Update the trigger function for new users with correct column name and role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'publicador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to include dirigente role
DROP POLICY IF EXISTS "Admins can insert campaigns" ON campaigns;
CREATE POLICY "Admins and dirigentes can insert campaigns" ON campaigns
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can update campaigns" ON campaigns;
CREATE POLICY "Admins and dirigentes can update campaigns" ON campaigns
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can delete campaigns" ON campaigns;
CREATE POLICY "Admins and dirigentes can delete campaigns" ON campaigns
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can insert territories" ON territories;
CREATE POLICY "Admins and dirigentes can insert territories" ON territories
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can update territories" ON territories;
CREATE POLICY "Admins and dirigentes can update territories" ON territories
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can delete territories" ON territories;
CREATE POLICY "Admins and dirigentes can delete territories" ON territories
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can insert subdivisions" ON subdivisions;
CREATE POLICY "Admins and dirigentes can insert subdivisions" ON subdivisions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can delete subdivisions" ON subdivisions;
CREATE POLICY "Admins and dirigentes can delete subdivisions" ON subdivisions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can insert assignments" ON assignments;
CREATE POLICY "Admins and dirigentes can insert assignments" ON assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

DROP POLICY IF EXISTS "Admins can delete assignments" ON assignments;
CREATE POLICY "Admins and dirigentes can delete assignments" ON assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );
