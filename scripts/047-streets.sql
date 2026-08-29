-- ============================================================
-- Migration 047: Nível de rua dentro da quadra (residencial)
-- ============================================================
-- Hierarquia completa passa a ser:
--   Território → Quadra (subdivisions) → Rua (streets, nova) → Casas (units)
-- Só afeta o fluxo residencial. Condomínio continua como está
-- (blocks/subdivisions → units direto, sem essa camada extra).
--
-- units.subdivision_id continua existindo (usado pelo condomínio
-- tipo "Casas", onde a subdivision JÁ é a rua, sem quadra no meio).
-- units.street_id é o novo terceiro caminho, exclusivo com os outros dois.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabela streets
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.streets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subdivision_id UUID        NOT NULL REFERENCES public.subdivisions(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  order_index    INTEGER     NOT NULL DEFAULT 0,
  completed      BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streets_subdivision_id ON public.streets(subdivision_id);

ALTER TABLE public.streets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view streets" ON public.streets;
CREATE POLICY "Authenticated users can view streets" ON public.streets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins and dirigentes manage streets" ON public.streets;
CREATE POLICY "Admins and dirigentes manage streets" ON public.streets
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

-- ────────────────────────────────────────────────────────────
-- 2. units.street_id + constraint de posse (agora 3 vias)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS street_id UUID REFERENCES public.streets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_units_street_id ON public.units(street_id);

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS unit_belongs_to_one;
ALTER TABLE public.units
  ADD CONSTRAINT unit_belongs_to_one CHECK (
    ((block_id IS NOT NULL)::int + (subdivision_id IS NOT NULL)::int + (street_id IS NOT NULL)::int) = 1
  );

-- ────────────────────────────────────────────────────────────
-- 3. can_mark_unit() — passa a resolver território também via street
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_mark_unit(p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_territory_id UUID;
  v_assigned_to UUID;
  v_role TEXT;
BEGIN
  SELECT COALESCE(b.territory_id, s.territory_id, s2.territory_id) INTO v_territory_id
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
  LEFT JOIN public.streets st ON st.id = u.street_id
  LEFT JOIN public.subdivisions s2 ON s2.id = st.subdivision_id
  WHERE u.id = p_unit_id;

  IF v_territory_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('admin', 'dirigente') THEN
    RETURN true;
  END IF;

  SELECT assigned_to INTO v_assigned_to FROM public.territories WHERE id = v_territory_id;
  RETURN v_assigned_to = auth.uid();
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. mark_unit_via_link() — escopo de link também aceita unidade
--    alcançada via rua (link de quadra cobre todas as ruas dela)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_unit_via_link(
  p_link_id UUID,
  p_unit_id UUID,
  p_session_id UUID,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_unit RECORD;
BEGIN
  IF p_new_status NOT IN ('pending', 'visited', 'visited_carta', 'do_not_visit') THEN
    RAISE EXCEPTION 'status inválido';
  END IF;

  SELECT * INTO v_link FROM public.field_links WHERE id = p_link_id;
  IF v_link IS NULL THEN
    RAISE EXCEPTION 'link inválido';
  END IF;
  IF v_link.expires_at < NOW() THEN
    RAISE EXCEPTION 'link expirado';
  END IF;

  SELECT
    u.*,
    COALESCE(b.territory_id, s.territory_id, s2.territory_id) AS territory_id,
    COALESCE(s.id, s2.id) AS effective_subdivision_id
  INTO v_unit
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
  LEFT JOIN public.streets st ON st.id = u.street_id
  LEFT JOIN public.subdivisions s2 ON s2.id = st.subdivision_id
  WHERE u.id = p_unit_id;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'unidade não encontrada';
  END IF;

  -- Confirma que a unidade está dentro do escopo do link
  IF NOT (
    (v_link.subdivision_id IS NOT NULL AND v_unit.effective_subdivision_id = v_link.subdivision_id)
    OR (v_link.block_id IS NOT NULL AND v_unit.block_id = v_link.block_id)
    OR (v_link.subdivision_id IS NULL AND v_link.block_id IS NULL AND v_unit.territory_id = v_link.territory_id)
  ) THEN
    RAISE EXCEPTION 'unidade fora do escopo do link';
  END IF;

  -- Trava: só quem marcou 'do_not_visit' pode alterar (dentro da mesma janela de 2h, já garantida acima)
  IF v_unit.status = 'do_not_visit' AND v_unit.marked_by IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'unidade travada — só quem marcou pode alterar';
  END IF;

  UPDATE public.units
  SET status = p_new_status, marked_by = p_session_id, marked_at = NOW()
  WHERE id = p_unit_id;

  RETURN true;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. get_field_link_units() — agrupa por rua quando alcançada
--    via street_id, mantendo bloco/rua-direta como já era
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_field_link_units(p_link_id UUID)
RETURNS TABLE (
  link_valid BOOLEAN,
  link_expired BOOLEAN,
  territory_name TEXT,
  territory_number TEXT,
  group_id UUID,
  group_label TEXT,
  unit_id UUID,
  unit_number TEXT,
  unit_floor INTEGER,
  unit_status TEXT,
  unit_marked_at TIMESTAMPTZ,
  unit_marked_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
BEGIN
  SELECT * INTO v_link FROM public.field_links WHERE id = p_link_id;

  IF v_link IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true,
    (v_link.expires_at < NOW()),
    t.name,
    t.number,
    COALESCE(b.id, s.id, st.id, t.id) AS group_id,
    COALESCE(b.name, s.name, st.name, 'Casas') AS group_label,
    u.id,
    u.number,
    u.floor,
    u.status,
    u.marked_at,
    u.marked_by
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
  LEFT JOIN public.streets st ON st.id = u.street_id
  LEFT JOIN public.subdivisions s2 ON s2.id = st.subdivision_id
  JOIN public.territories t ON t.id = COALESCE(b.territory_id, s.territory_id, s2.territory_id)
  WHERE
    (v_link.subdivision_id IS NOT NULL AND (u.subdivision_id = v_link.subdivision_id OR s2.id = v_link.subdivision_id))
    OR (v_link.block_id IS NOT NULL AND u.block_id = v_link.block_id)
    OR (v_link.subdivision_id IS NULL AND v_link.block_id IS NULL AND COALESCE(b.territory_id, s.territory_id, s2.territory_id) = v_link.territory_id)
  ORDER BY group_label, u.floor NULLS FIRST, u.number;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT true, (v_link.expires_at < NOW()), t.name, t.number,
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID
    FROM public.territories t WHERE t.id = v_link.territory_id;
  END IF;
END;
$$;
