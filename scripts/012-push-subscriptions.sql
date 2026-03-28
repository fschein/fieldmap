-- ============================================================
-- 012-push-subscriptions.sql
-- Sistema de Notificações Push PWA para o FieldMap
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuários só podem ver e excluir suas próprias inscrições
CREATE POLICY "Users can manage their own subscriptions"
ON public.push_subscriptions
FOR ALL
USING (auth.uid() = user_id);

-- Comentário para documentação do banco
COMMENT ON TABLE public.push_subscriptions IS 'Armazena as inscrições de Web Push dos dispositivos dos usuários.';
