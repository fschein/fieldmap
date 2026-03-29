-- data-fix-territory-status.sql
-- Corrige territórios que constam como Devolvidos/Assigned mas já foram concluídos.

UPDATE public.territories
SET status = 'available', assigned_to = NULL, updated_at = now()
WHERE number IN ('6', '7', '8', '9', '10', '12', '13');

-- Opcionalmente, garante que o último registro do histórico reflita a realidade se necessário, 
-- mas o comando acima limpa a tag principal visual.
