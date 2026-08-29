-- ============================================================
-- Migration 043: Fix infinite recursion in profiles RLS policies
-- ============================================================
-- INCIDENT: after 042 enabled RLS on `profiles`, several pre-existing
-- policies (created by earlier, never-cleaned-up migrations) turned out
-- to check the admin role via a subquery on `profiles` itself, e.g.:
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
-- With RLS actually enforced, evaluating that subquery re-triggers the
-- same policy set on `profiles`, which recurses forever. Postgres detects
-- this and every query touching `profiles` (and anything whose policy
-- checks `profiles`, e.g. notifications) started failing with:
--   "infinite recursion detected in policy for relation \"profiles\""
-- This took the whole app down (dashboard stuck on "Carregando...").
--
-- `pg_policies` also revealed the table had accumulated 13 policies from
-- several redundant past migrations (many duplicates of the same intent
-- under different names, in English and Portuguese).
--
-- Fix: a SECURITY DEFINER helper function reads `profiles` as its owner
-- (bypasses RLS for that one lookup), so checking "is this user an admin"
-- no longer re-enters the policy being evaluated. Recursive policies are
-- replaced by calls to this function; duplicates are dropped.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ────────────────────────────────────────────────────────────
-- Drop recursive policies (self-referencing subquery on profiles)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins podem deletar perfis" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins e Dirigentes podem ver todos os perfis" ON public.profiles;
DROP POLICY IF EXISTS "Admins and self can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins podem atualizar perfis" ON public.profiles;

-- ────────────────────────────────────────────────────────────
-- Drop duplicate non-recursive policies (same intent, extra copies)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_read_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "allow_update_own_profile" ON public.profiles;

-- ────────────────────────────────────────────────────────────
-- Remaining canonical set (kept as-is, listed here for reference):
--   "Authenticated users can view all profiles"  SELECT  USING (true)
--   "Enable insert for authenticated users"       INSERT  WITH CHECK (auth.uid() = id)
-- ────────────────────────────────────────────────────────────

-- Re-add admin-only DELETE and admin-or-self UPDATE using the helper
-- function (needed by app/dashboard/users/page.tsx, which updates/deletes
-- other users' profiles via the browser client, not the service role).
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins and self can update profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- Verification (run manually to confirm after apply)
-- ────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'profiles' ORDER BY cmd, policyname;
--
-- SELECT id, name, role FROM public.profiles LIMIT 1; -- should NOT error
