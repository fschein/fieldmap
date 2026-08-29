-- ============================================================
-- Migration 051: "Sugerir edição" no link de campo
-- ============================================================
-- Visitante anônimo do link de campo pode sugerir casas a
-- adicionar/remover numa rua. A sugestão vira estado real na
-- própria tabela units (pending_action), não um texto separado:
--   - "adicionar" cria a unidade de verdade, já com pending_action
--     = 'add' — assim quem sugeriu pode marcar status nela
--     normalmente (mark_unit_via_link já funciona, é uma linha real).
--   - "remover" só marca pending_action = 'remove' na unidade
--     existente — ela continua existindo até o admin decidir.
-- suggestion_batch_id agrupa tudo que foi enviado de uma vez, pra
-- aprovar/recusar em lote de uma vez só.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. units: estado de sugestão pendente
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS pending_action TEXT CHECK (pending_action IN ('add', 'remove'));
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS suggestion_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_units_suggestion_batch_id ON public.units(suggestion_batch_id) WHERE suggestion_batch_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. notifications: novo tipo + colunas de contexto
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS subdivision_id UUID REFERENCES public.subdivisions(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS suggestion_batch_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS suggestion_add TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS suggestion_remove TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS suggestion_status TEXT CHECK (suggestion_status IN ('pending', 'applied', 'declined'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'request', 'returned', 'idle', 'assigned', 'overdue', 'completed',
    'transferred', 'progress_60', 'completed_subdivisions', 'idle_publisher',
    'schedule_checkin', 'schedule_upcoming', 'suggested_edit'
  ));

-- ────────────────────────────────────────────────────────────
-- 3. RPC: submit_unit_suggestions_via_link — visitante envia o lote
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_unit_suggestions_via_link(
  p_link_id UUID,
  p_street_id UUID,
  p_add_numbers TEXT[],
  p_remove_unit_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_street RECORD;
  v_territory_number TEXT;
  v_batch_id UUID := gen_random_uuid();
  v_add_labels TEXT;
  v_remove_labels TEXT;
BEGIN
  IF COALESCE(array_length(p_add_numbers, 1), 0) = 0 AND COALESCE(array_length(p_remove_unit_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'sugestão vazia';
  END IF;

  SELECT * INTO v_link FROM public.field_links WHERE id = p_link_id;
  IF v_link IS NULL THEN
    RAISE EXCEPTION 'link inválido';
  END IF;

  -- Rua precisa pertencer à quadra do link.
  SELECT st.*, s.name AS quadra_name INTO v_street
  FROM public.streets st
  JOIN public.subdivisions s ON s.id = st.subdivision_id
  WHERE st.id = p_street_id AND st.subdivision_id = v_link.subdivision_id;

  IF v_street IS NULL THEN
    RAISE EXCEPTION 'rua fora do escopo do link';
  END IF;

  -- Adições: cria as unidades de verdade, já marcadas como pendentes.
  IF array_length(p_add_numbers, 1) > 0 THEN
    INSERT INTO public.units (street_id, number, status, pending_action, suggestion_batch_id)
    SELECT p_street_id, n, 'pending', 'add', v_batch_id
    FROM unnest(p_add_numbers) AS n
    WHERE COALESCE(TRIM(n), '') <> '';

    SELECT string_agg(n, ', ') INTO v_add_labels FROM unnest(p_add_numbers) AS n WHERE COALESCE(TRIM(n), '') <> '';
  END IF;

  -- Remoções: só sinaliza — confere que a unidade é da mesma rua do link.
  IF array_length(p_remove_unit_ids, 1) > 0 THEN
    UPDATE public.units
    SET pending_action = 'remove', suggestion_batch_id = v_batch_id
    WHERE id = ANY(p_remove_unit_ids) AND street_id = p_street_id;

    SELECT string_agg(number, ', ') INTO v_remove_labels
    FROM public.units WHERE id = ANY(p_remove_unit_ids) AND street_id = p_street_id;
  END IF;

  SELECT number INTO v_territory_number FROM public.territories WHERE id = v_link.territory_id;

  INSERT INTO public.notifications (
    type, title, message, territory_id, subdivision_id,
    suggestion_batch_id, suggestion_add, suggestion_remove, suggestion_status, target_user_id
  ) VALUES (
    'suggested_edit',
    'Sugestão de edição · ' || v_street.name,
    'Alguém no link de campo de ' || COALESCE(v_territory_number, '') || ' sugeriu mudanças na ' || v_street.name || '.',
    v_link.territory_id,
    v_link.subdivision_id,
    v_batch_id,
    v_add_labels,
    v_remove_labels,
    'pending',
    NULL
  );

  RETURN v_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_unit_suggestions_via_link(UUID, UUID, TEXT[], UUID[]) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. RPC: resolve_unit_suggestion_batch — admin/supervisor aplica ou recusa
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_unit_suggestion_batch(
  p_batch_id UUID,
  p_approve BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')) THEN
    RAISE EXCEPTION 'apenas admin ou supervisor pode resolver sugestões';
  END IF;

  IF p_approve THEN
    -- Adições viram permanentes; remoções são de fato apagadas.
    UPDATE public.units SET pending_action = NULL, suggestion_batch_id = NULL
      WHERE suggestion_batch_id = p_batch_id AND pending_action = 'add';
    DELETE FROM public.units
      WHERE suggestion_batch_id = p_batch_id AND pending_action = 'remove';
  ELSE
    -- Adições nunca existiram de verdade; remoções voltam ao normal.
    DELETE FROM public.units
      WHERE suggestion_batch_id = p_batch_id AND pending_action = 'add';
    UPDATE public.units SET pending_action = NULL, suggestion_batch_id = NULL
      WHERE suggestion_batch_id = p_batch_id AND pending_action = 'remove';
  END IF;

  UPDATE public.notifications
  SET suggestion_status = CASE WHEN p_approve THEN 'applied' ELSE 'declined' END, read = true
  WHERE suggestion_batch_id = p_batch_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_unit_suggestion_batch(UUID, BOOLEAN) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. get_field_link_units — passa a expor pending_action, pra tela
--    do link desenhar o chip fantasma (verde=add, vermelho=remove).
--    Precisa de DROP antes: mudar as colunas de retorno de uma
--    function existente não é permitido via CREATE OR REPLACE.
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_field_link_units(UUID);

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
  unit_marked_by UUID,
  unit_pending_action TEXT
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
      NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID, NULL::TEXT;
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
    u.marked_by,
    u.pending_action
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
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID, NULL::TEXT
    FROM public.territories t WHERE t.id = v_link.territory_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_field_link_units(UUID) TO anon, authenticated;
