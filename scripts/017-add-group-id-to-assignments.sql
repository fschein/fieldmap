-- Migration: Adicionar group_id às designações
-- Permite que uma designação seja feita para um grupo inteiro (Modo Domingo).

ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE;

-- Tornar user_id opcional (pode ser nulo se for uma designação de grupo)
ALTER TABLE public.assignments 
ALTER COLUMN user_id DROP NOT NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_assignments_group_id ON public.assignments(group_id);
