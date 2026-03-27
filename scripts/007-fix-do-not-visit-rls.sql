-- Script de Correção RLS para Não Visitar
-- Este script atualiza a política de inserção de Não Visitar para que publicadores 
-- possam adicionar pontos aos territórios que estão designados a eles.

-- 1. Remove a política antiga (que quebrou) se ela existir
DROP POLICY IF EXISTS "Publisher can insert do_not_visits for their assignments" ON public.do_not_visits;

-- 2. Cria a nova política corrigida baseada diretamente no dono do território
CREATE POLICY "Publisher can insert do_not_visits for their assignments"
ON public.do_not_visits
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.territories 
        WHERE id = do_not_visits.territory_id 
        AND assigned_to = auth.uid()
    )
);
