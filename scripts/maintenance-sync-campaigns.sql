-- ============================================================
-- maintenance-sync-campaigns.sql
-- Harmoniza o campaign_id do território com sua designação ativa
-- ============================================================

-- Atualiza o territory.campaign_id com o campaign_id da designação 'active' mais recente
UPDATE public.territories t
SET campaign_id = a.campaign_id
FROM public.assignments a
WHERE a.territory_id = t.id
  AND a.status = 'active'
  AND (t.campaign_id IS DISTINCT FROM a.campaign_id);

-- Opcional: Limpa campaign_id de territórios sem designação ativa
-- UPDATE public.territories t
-- SET campaign_id = NULL
-- WHERE NOT EXISTS (SELECT 1 FROM public.assignments a WHERE a.territory_id = t.id AND a.status = 'active');
