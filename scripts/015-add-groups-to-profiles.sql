-- Migration: Adicionar group_id aos perfis de usuário
-- Este script permite associar um dirigente/usuário a um grupo específico para trabalho de domingo.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- Comentário: Verifique se as políticas de RLS permitem que administradores atualizem este campo.
-- Geralmente: ALTER POLICY "Admins can update profiles" ON public.profiles USING (auth.jwt() ->> 'role' = 'service_role' OR ...);
