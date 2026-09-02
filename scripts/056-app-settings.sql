-- ============================================================
-- Migration 056: Tabela de Configurações do app
-- ============================================================
-- Tabela singleton (uma linha só) com os ajustes gerais de território e
-- casas, hoje hardcoded no código: dias pra "atrasado" (90), dias pra
-- "muito recente" (25), se o app usa casa-a-casa (sempre usou até agora),
-- e quais opções de marcação de casa ficam ativas na gaveta.
--
-- Valores padrão = comportamento atual do app, pra não mudar nada na hora
-- do deploy — o admin ajusta depois na tela de Configurações se quiser.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), -- garante uma única linha
  overdue_days INTEGER NOT NULL DEFAULT 90,
  recent_days INTEGER NOT NULL DEFAULT 25,
  use_houses BOOLEAN NOT NULL DEFAULT true,
  enabled_marking_options TEXT[] NOT NULL DEFAULT ARRAY['visited', 'visited_carta', 'do_not_visit'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_settings_marking_options_nonempty CHECK (array_length(enabled_marking_options, 1) >= 1)
);

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Leitura liberada geral (inclusive anônimo — a página pública de link de
-- campo também precisa saber quais opções de marcação estão ativas).
DROP POLICY IF EXISTS "Configurações são públicas para leitura" ON public.app_settings;
CREATE POLICY "Configurações são públicas para leitura" ON public.app_settings
  FOR SELECT USING (true);

-- Só admin altera.
DROP POLICY IF EXISTS "Só admin altera configurações" ON public.app_settings;
CREATE POLICY "Só admin altera configurações" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- Nova opção de marcação: "Não em casa" — registra a tentativa sem
-- contar como visitado de verdade (a casa continua pendente).
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_status_check;
ALTER TABLE public.units ADD CONSTRAINT units_status_check
  CHECK (status IN ('pending', 'visited', 'visited_carta', 'do_not_visit', 'not_home'));

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
  IF p_new_status NOT IN ('pending', 'visited', 'visited_carta', 'do_not_visit', 'not_home') THEN
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
