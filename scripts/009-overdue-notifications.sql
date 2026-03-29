-- 009-overdue-notifications-routine.sql
-- Insere notificações de atraso para territórios com mais de 90 dias

INSERT INTO public.notifications (type, title, message, user_id, territory_id, created_at)
SELECT 
    'overdue',
    'Território em atraso',
    'O território ' || t.number || ' está com você há mais de 90 dias. Por favor, considere devolvê-lo ou finalizá-lo em breve.',
    a.user_id,
    t.id,
    now()
FROM 
    public.territories t
JOIN 
    public.assignments a ON a.territory_id = t.id AND a.status = 'active'
WHERE 
    a.assigned_at < now() - interval '90 days'
    AND NOT EXISTS (
        SELECT 1 FROM public.notifications n 
        WHERE n.type = 'overdue' 
        AND n.territory_id = t.id 
        AND n.user_id = a.user_id
        AND n.created_at > now() - interval '7 days'
    );
