-- ============================================================
-- 008-notifications-schema.sql
-- Sistema de Notificações In-App do FieldMap
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('request', 'returned', 'idle', 'assigned', 'overdue')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admins/Dirigentes can see and update all notifications
-- Users can see notifications they created OR that are targeted at them
DROP POLICY IF EXISTS "Users can view relevant notifications" ON public.notifications;
CREATE POLICY "Users can view relevant notifications"
ON public.notifications FOR SELECT
USING (
  auth.uid() = user_id OR 
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
);

-- Realtime enablement
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- All logged-in users can insert notifications (to trigger requests/events)
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
 