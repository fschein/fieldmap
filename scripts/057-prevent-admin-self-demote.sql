-- ============================================================
-- Migration 057: Admin nunca pode rebaixar o próprio perfil
-- ============================================================
-- A trigger de 049 impede não-admin de mexer no próprio role, mas
-- deixa admin livre pra alterar QUALQUER role, inclusive o próprio —
-- um admin podia se rebaixar sem querer (ou por engano de outra
-- pessoa com acesso à conta) e ficar trancado fora das áreas
-- administrativas. Agora: admin pode rebaixar qualquer outro usuário
-- normalmente, mas nunca o próprio perfil.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Ninguém, nem admin, pode tirar o próprio role de 'admin'.
  IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode rebaixar seu próprio perfil de administrador.';
  END IF;

  -- auth.uid() só é NULL quando não há usuário autenticado na sessão —
  -- na prática, só a service_role chega aqui nesse estado (qualquer
  -- request anônima real já é barrada pelo RLS antes de tocar na
  -- trigger). service_role já ignora RLS por definição; não faz sentido
  -- essa trigger ser a única coisa que ainda a bloqueia.
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o campo role.';
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Verificação (rodar manualmente após aplicar)
-- ────────────────────────────────────────────────────────────
-- Logado como admin, tentar rebaixar a si mesmo deve falhar:
--   UPDATE public.profiles SET role = 'dirigente' WHERE id = auth.uid();
--
-- Logado como admin, rebaixar OUTRO admin continua ok:
--   UPDATE public.profiles SET role = 'dirigente' WHERE id = '<outro-admin-id>';
