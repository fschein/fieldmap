-- Migration 042: Enable RLS on profiles and remove two dangerous policies.
--
-- profiles had RLS disabled (rls_disabled_in_public alert) despite having
-- 15 policies defined, so none of them were enforced. Two of those policies
-- are dangerous on their own and must be dropped before re-enabling RLS:
--
--   "Acesso total perfis autenticados" (ALL, authenticated, qual true,
--   with_check true) grants any logged-in user full read/write/delete on
--   every profile, including self-promoting to admin or deleting other
--   accounts.
--
--   "Users can view all profiles" (SELECT, role public, qual true) exposes
--   every profile (name, email, phone, role) to unauthenticated requests
--   via the Supabase REST API (the anon key is public in the client bundle).
--
-- The remaining policies already cover the intended access pattern
-- (self view/update via auth.uid() = id, admin-only insert/update/delete of
-- other profiles, general read for authenticated users), confirmed against
-- the app code: the only caller that relied on the public SELECT policy was
-- the login page's "is the database empty" onboarding check, which has been
-- moved to /api/auth/is-empty (service-role, bypasses RLS).

DROP POLICY IF EXISTS "Acesso total perfis autenticados" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
