-- push_subscriptions.user_id tem uma FK, mas apontando para auth.users, não para
-- public.profiles (provavelmente criada pela migration 030 antes da 012 rodar).
-- Sem uma FK direta para profiles, o PostgREST não consegue resolver o embed
-- `profiles!inner(role)` usado em lib/notifications.ts para notificar por role
-- (ex: notifyAdmins) — a busca simplesmente vem vazia, sem erro, e o push nunca
-- é enviado. Envio direto por user_id funcionava normalmente porque não depende
-- de join nenhum.

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;

-- Remove inscrições órfãs (usuário que não existe mais em profiles), senão o FK falha.
DELETE FROM public.push_subscriptions
WHERE user_id NOT IN (SELECT id FROM public.profiles);

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Força o PostgREST a recarregar o cache de schema imediatamente.
NOTIFY pgrst, 'reload schema';
