-- maintenance-sync-territory-status.sql
-- Sincroniza o campo 'status' e 'assigned_to' da tabela 'territories' com a realidade do histórico de 'assignments'

DO $$ 
DECLARE 
    t_record RECORD;
    latest_assignment RECORD;
BEGIN
    FOR t_record IN SELECT id FROM territories LOOP
        -- Busca a última designação deste território
        SELECT * INTO latest_assignment 
        FROM assignments 
        WHERE territory_id = t_record.id 
        ORDER BY assigned_at DESC 
        LIMIT 1;

        IF latest_assignment IS NULL THEN
            -- Nunca foi designado
            UPDATE territories 
            SET status = 'available', 
                assigned_to = NULL, 
                updated_at = NOW() 
            WHERE id = t_record.id;
        ELSIF latest_assignment.status = 'active' THEN
            -- Está atualmente em campo
            UPDATE territories 
            SET status = 'assigned', 
                assigned_to = latest_assignment.user_id, 
                updated_at = NOW() 
            WHERE id = t_record.id;
        ELSIF latest_assignment.status = 'completed' THEN
            -- Foi concluído na última vez
            UPDATE territories 
            SET status = 'completed', 
                assigned_to = NULL, 
                updated_at = NOW() 
            WHERE id = t_record.id;
        ELSIF latest_assignment.status = 'returned' THEN
            -- Foi devolvido (provavelmente incompleto) na última vez
            UPDATE territories 
            SET status = 'available', 
                assigned_to = NULL, 
                updated_at = NOW() 
            WHERE id = t_record.id;
        END IF;
    END LOOP;
END $$;
