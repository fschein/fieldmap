-- Adiciona coluna last_seen_at na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

-- Limpa os valores iniciais para não parecer erro de sincronização
UPDATE public.profiles SET last_seen_at = NULL;

-- Comentário para documentação do banco
COMMENT ON COLUMN public.profiles.last_seen_at IS 'Data e hora do último acesso do usuário ao sistema.';
