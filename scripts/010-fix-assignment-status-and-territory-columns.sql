-- Garante que territories tem a coluna assigned_to
ALTER TABLE public.territories ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Índice para busca rápida de territórios por publicador
CREATE INDEX IF NOT EXISTS idx_territories_assigned_to ON territories(assigned_to);

-- Normaliza STATUS inconsistentes em assignments antes de adicionar a constraint
-- (migra valores antigos do schema para o padrão atual do app)
UPDATE public.assignments SET status = 'active'     WHERE status = 'in_progress';
UPDATE public.assignments SET status = 'active'     WHERE status = 'pending';

-- Agora aplica o constraint com todos os valores válidos
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_status_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_status_check
  CHECK (status IN ('active', 'completed', 'returned'));

