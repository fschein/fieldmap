-- ============================================================
-- Migration 049: Impede auto-promoção via profiles.role
-- ============================================================
-- 042/043 corrigiram RLS desabilitado e uma recursão infinita, mas a
-- policy final de UPDATE que sobrou não tem WITH CHECK:
--
--   CREATE POLICY "Admins and self can update profiles" ON public.profiles
--     FOR UPDATE TO authenticated
--     USING (auth.uid() = id OR public.is_admin());
--
-- Sem WITH CHECK, o Postgres reusa a mesma expressão do USING — que só
-- controla QUAL LINHA pode ser tocada (a própria, ou qualquer uma se for
-- admin), não QUAIS COLUNAS. Qualquer usuário autenticado ainda consegue,
-- direto pela API REST do Supabase (sem passar pela UI, que só checa role
-- no client):
--
--   PATCH /rest/v1/profiles?id=eq.<próprio-id>
--   { "role": "admin" }
--
-- RLS não tem um jeito nativo de dizer "essa coluna não muda a não ser que
-- X" — WITH CHECK só vê a linha proposta (NEW), não dá pra comparar contra
-- o valor anterior (OLD) sem reconsultar a própria tabela. Trigger é a
-- ferramenta certa aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o campo role.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();

-- ────────────────────────────────────────────────────────────
-- Verificação (rodar manualmente após aplicar)
-- ────────────────────────────────────────────────────────────
-- Logado como usuário NÃO-admin, deve falhar com a exceção acima:
--   UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
--
-- Logado como o mesmo usuário, editar outro campo próprio continua ok:
--   UPDATE public.profiles SET name = name WHERE id = auth.uid();
--
-- Logado como admin, alterar o role de OUTRO usuário continua ok
-- (is_admin() aqui avalia quem está executando o UPDATE, não o dono da
-- linha):
--   UPDATE public.profiles SET role = 'supervisor' WHERE id = '<outro-id>';
