-- ============================================================
-- Migration 045: Casa-a-casa (units) + link de campo
-- ============================================================
-- 1. units.status ganha 'visited_carta' (separado de 'visited').
-- 2. units.marked_by / marked_at — quem marcou e quando.
-- 3. Tabela field_links — link público com expiração de 2h,
--    escopado a uma quadra (subdivision), bloco (block) ou
--    território inteiro (condominial "Casas", sem separação).
-- 4. Função can_mark_unit() — mesma checagem de posse usada na
--    policy de UPDATE de units e reaproveitada pelas RPCs.
-- 5. RPC mark_unit_via_link() — única porta de escrita para
--    visitantes anônimos do link (SECURITY DEFINER; nenhuma
--    tabela nova ganha policy permissiva pra "anon").
-- 6. RPC get_field_link_units() — única porta de leitura para
--    visitantes anônimos do link.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. is_admin() — definida em 043-fix-profiles-rls-recursion.sql,
--    mas esse script pode nunca ter rodado neste banco. Recriar
--    aqui (idempotente, CREATE OR REPLACE) pra 045 não depender
--    de 043 ter sido aplicado antes.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ────────────────────────────────────────────────────────────
-- 1. units.status: 3 → 4 valores
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_status_check;
ALTER TABLE public.units
  ADD CONSTRAINT units_status_check
    CHECK (status IN ('pending', 'visited', 'visited_carta', 'do_not_visit'));

-- ────────────────────────────────────────────────────────────
-- 2. units.marked_by / marked_at
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS marked_by UUID;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────
-- 3. Tabela field_links
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_links (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id   UUID        NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  subdivision_id UUID        REFERENCES public.subdivisions(id) ON DELETE CASCADE,
  block_id       UUID        REFERENCES public.blocks(id) ON DELETE CASCADE,
  created_by     UUID        REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),

  CONSTRAINT field_links_scope_check CHECK (
    subdivision_id IS NULL OR block_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_field_links_territory_id ON public.field_links(territory_id);

ALTER TABLE public.field_links ENABLE ROW LEVEL SECURITY;

-- Só staff autenticado gera/lista links (leitura direta da tabela é só pra
-- quem já está logado no dashboard; visitante anônimo do link nunca toca
-- esta tabela diretamente — só via as RPCs abaixo).
DROP POLICY IF EXISTS "Admins and dirigentes manage field links" ON public.field_links;
CREATE POLICY "Admins and dirigentes manage field links" ON public.field_links
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente'))
  );

-- ────────────────────────────────────────────────────────────
-- 4. can_mark_unit(unit_id) — admin, dirigente, ou publicador
--    designado ao território pai da unidade
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
  SELECT COALESCE(b.territory_id, s.territory_id) INTO v_territory_id
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
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
-- Policy de UPDATE em units (staff autenticado) — substitui a
-- policy de 041, que não conhecia o estado 'do_not_visit' nem
-- a trava de "só quem marcou desmarca".
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins or assigned publishers can update units" ON public.units;
DROP POLICY IF EXISTS "Staff can mark units" ON public.units;
CREATE POLICY "Staff can mark units" ON public.units
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.can_mark_unit(id)
      AND (status != 'do_not_visit' OR marked_by = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────
-- 5. RPC: mark_unit_via_link — única escrita permitida a "anon"
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
  v_unit_territory_id UUID;
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

  SELECT u.*, COALESCE(b.territory_id, s.territory_id) AS territory_id
    INTO v_unit
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
  WHERE u.id = p_unit_id;

  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'unidade não encontrada';
  END IF;

  -- Confirma que a unidade está dentro do escopo do link
  IF NOT (
    (v_link.subdivision_id IS NOT NULL AND v_unit.subdivision_id = v_link.subdivision_id)
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

GRANT EXECUTE ON FUNCTION public.mark_unit_via_link(UUID, UUID, UUID, TEXT) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. RPC: get_field_link_units — única leitura permitida a "anon"
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
    COALESCE(b.id, s.id, t.id) AS group_id,
    COALESCE(b.name, s.name, 'Casas') AS group_label,
    u.id,
    u.number,
    u.floor,
    u.status,
    u.marked_at,
    u.marked_by
  FROM public.units u
  LEFT JOIN public.blocks b ON b.id = u.block_id
  LEFT JOIN public.subdivisions s ON s.id = u.subdivision_id
  JOIN public.territories t ON t.id = COALESCE(b.territory_id, s.territory_id)
  WHERE
    (v_link.subdivision_id IS NOT NULL AND u.subdivision_id = v_link.subdivision_id)
    OR (v_link.block_id IS NOT NULL AND u.block_id = v_link.block_id)
    OR (v_link.subdivision_id IS NULL AND v_link.block_id IS NULL AND COALESCE(b.territory_id, s.territory_id) = v_link.territory_id)
  ORDER BY group_label, u.floor NULLS FIRST, u.number;

  -- Se não há nenhuma unidade ainda, ao menos devolve os dados do
  -- território/validade do link (uma linha só de metadados).
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT true, (v_link.expires_at < NOW()), t.name, t.number,
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::UUID
    FROM public.territories t WHERE t.id = v_link.territory_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_field_link_units(UUID) TO anon, authenticated;
