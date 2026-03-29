-- 014-add-completed-to-notification-types.sql
-- Adiciona o tipo 'completed' à constraint de notificações

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('request', 'returned', 'idle', 'assigned', 'overdue', 'completed'));
