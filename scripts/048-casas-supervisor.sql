-- ============================================================
-- Migration 048: Módulo de casas em teste — inclui supervisor
-- ============================================================
-- O front-end agora só mostra o módulo casa-a-casa (streets/units/
-- field_links) pra admin e supervisor — dirigente e publicador não
-- veem mais essa tela. Pra não deixar botões visíveis quebrados,
-- as policies que já existiam pra admin/dirigente ganham 'supervisor'
-- também. Não removi dirigente das policies (só saiu da UI) — é um
-- teste, não uma revogação de acesso já concedido no banco.
-- ============================================================

-- streets (migration 047)
DROP POLICY IF EXISTS "Admins and dirigentes manage streets" ON public.streets;
CREATE POLICY "Admins, dirigentes and supervisors manage streets" ON public.streets
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente', 'supervisor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente', 'supervisor'))
  );

-- field_links (migration 045)
DROP POLICY IF EXISTS "Admins and dirigentes manage field links" ON public.field_links;
CREATE POLICY "Admins, dirigentes and supervisors manage field links" ON public.field_links
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente', 'supervisor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dirigente', 'supervisor'))
  );

-- units insert/delete (migration 041 — hoje é admin-only)
DROP POLICY IF EXISTS "Admins can insert units" ON public.units;
CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

DROP POLICY IF EXISTS "Admins can delete units" ON public.units;
CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

-- can_mark_unit() (migration 045/047) — passa a reconhecer supervisor também
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
  IF v_role IN ('admin', 'dirigente', 'supervisor') THEN
    RETURN true;
  END IF;

  SELECT assigned_to INTO v_assigned_to FROM public.territories WHERE id = v_territory_id;
  RETURN v_assigned_to = auth.uid();
END;
$$;
