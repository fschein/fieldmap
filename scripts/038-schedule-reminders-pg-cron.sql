-- Agenda a checagem de lembretes de escala (2h após início / 24h antes) a cada 20 min,
-- direto no Supabase — não depende do plano da Vercel (cron lá só roda 1x/dia no Hobby).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- IMPORTANTE: troque <CRON_SECRET_AQUI> pelo mesmo valor da env var CRON_SECRET na Vercel,
-- antes de rodar este script.
SELECT cron.schedule(
  'schedule-reminders-check',
  '*/20 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://fieldmap.schein.dev.br/api/cron/schedule-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET_AQUI>')
  );
  $$
);

-- Para remover o agendamento no futuro, se precisar:
-- SELECT cron.unschedule('schedule-reminders-check');
