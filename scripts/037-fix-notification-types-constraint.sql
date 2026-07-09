-- Adiciona os tipos de notificação usados no código mas ausentes do CHECK constraint.
-- Sem isso, o INSERT falha silenciosamente (sendNotification só loga o erro) e a
-- notificação nunca chega a existir no banco, muito menos ser enviada por push.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'request', 'returned', 'idle', 'assigned', 'overdue', 'completed',
    'transferred', 'progress_60', 'completed_subdivisions', 'idle_publisher',
    'schedule_checkin', 'schedule_upcoming'
  ));
