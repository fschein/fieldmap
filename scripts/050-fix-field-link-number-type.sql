-- ============================================================
-- Migration 050: Corrige erro de tipo em get_field_link_units
-- ============================================================
-- Abrir qualquer link de campo (/campo/[token]) falhava com:
--   code 42804 — "Returned type character varying(10) does not
--   match expected type text in column 4"
--
-- A função declara territory_number como TEXT, mas
-- territories.number é character varying(10) — Postgres não faz
-- coerção implícita disso dentro de RETURN QUERY. Afetava qualquer
-- link, residencial ou condomínio, desde que a função foi criada
-- (045) — só nunca tinha sido exercitado de ponta a ponta (abrir
-- como visitante anônimo) até agora.
--
-- Fix: cast explícito t.number::text nas duas SELECT (query
-- principal e o fallback "sem unidades ainda").
-- ============================================================

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
    t.name::TEXT,
    t.number::TEXT,
    COALESCE(b.id, s.id, st.id, t.id) AS group_id,
    COALESCE(b.name, s.name, st.name, 'Casas')::TEXT AS group_label,
    u.id,
    u.number::TEXT,
    u.floor,
    u.status::TEXT,
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
    SELECT true, (v_link.expires_at < NOW()), t.name::TEXT, t.number::TEXT,
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID
    FROM public.territories t WHERE t.id = v_link.territory_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_field_link_units(UUID) TO anon, authenticated;
