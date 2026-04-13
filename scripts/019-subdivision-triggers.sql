-- Migration: Trigger to clear notes when subdivision is completed
-- Rule: Ao marcar quadra como concluída: remover automaticamente a anotação

CREATE OR REPLACE FUNCTION public.handle_subdivision_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed = true THEN
        NEW.notes := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_clear_notes_on_completion ON public.subdivisions;

CREATE TRIGGER tr_clear_notes_on_completion
BEFORE UPDATE ON public.subdivisions
FOR EACH ROW
WHEN (NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed = true)
EXECUTE FUNCTION public.handle_subdivision_completion();
