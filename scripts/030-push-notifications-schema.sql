-- ============================================================
-- Migration 030: Push Notifications Schema Expansion
-- FieldMap · 2026-05
-- ============================================================

-- 1. Adiciona coluna target_user_id à tabela notifications
--    Permite segmentar para quem a notificação é destinada.
--    NULL = visível para todos os admins (comportamento anterior)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Índice para queries de notificações por usuário
CREATE INDEX IF NOT EXISTS idx_notifications_target_user
  ON notifications (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_read_target
  ON notifications (read, target_user_id, created_at DESC);

-- 3. Garante que a tabela push_subscriptions existe
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Índice para buscar subscriptions por usuário
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

-- 5. RLS: usuários só veem as próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_subscriptions" ON push_subscriptions;
CREATE POLICY "own_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- 6. Service role pode fazer tudo (para o cron e server-side)
DROP POLICY IF EXISTS "service_role_all_subscriptions" ON push_subscriptions;
CREATE POLICY "service_role_all_subscriptions" ON push_subscriptions
  FOR ALL TO service_role USING (true);

-- 7. RLS em notifications: admin/dirigente vê tudo; 
--    publicador vê apenas as direcionadas a ele
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_admin_view" ON notifications;
CREATE POLICY "notifications_admin_view" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'supervisor')
    )
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notifications_dirigente_view" ON notifications;
CREATE POLICY "notifications_dirigente_view" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'dirigente'
    )
    AND target_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "notifications_update_read" ON notifications;
CREATE POLICY "notifications_update_read" ON notifications
  FOR UPDATE USING (
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'supervisor')
    )
  );

DROP POLICY IF EXISTS "service_role_all_notifications" ON notifications;
CREATE POLICY "service_role_all_notifications" ON notifications
  FOR ALL TO service_role USING (true);
