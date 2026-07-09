-- Permite que supervisor veja todas as assignments (necessário para o dashboard)
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.assignments;

CREATE POLICY "Users can view their own assignments" ON public.assignments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );
