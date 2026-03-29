-- Migration: Adicionar campo is_active aos perfis
-- Permite inativar usuários sem excluí-los permanentemente.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Comentário: Administradores e dirigentes podem atualizar este campo.
