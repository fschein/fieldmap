# Roadmap — FieldMap

## Em avaliação

### Progresso por campanha
Investigando modelagem de progresso separado por campanha (sem quebrar o que existe).
Contexto: hoje subdivisions têm estado único e global — sem isolamento por campanha.

## Melhorias identificadas

### Limpar `territories.campaign_id` na conclusão/devolução de assignment
**Arquivo:** `app/api/assignments/complete/route.ts`

Hoje esse campo não é limpo quando um assignment é concluído ou devolvido, causando drift entre `territories.campaign_id` e `assignments.campaign_id`. O script `scripts/maintenance-sync-campaigns.sql` existe como paliativo manual.

**Fix:** adicionar `campaign_id: null` no update de territories dentro do endpoint de conclusão.
