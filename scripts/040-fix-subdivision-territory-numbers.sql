-- Corrige nomes de quadras que ainda têm o número ANTIGO do território
-- (ficou defasado depois da fusão de territórios, que deslocou a numeração
-- de alguns territórios em uma unidade).
--
-- Preserva a letra da quadra (A, B, C...) — só troca o prefixo numérico
-- pelo número ATUAL do território dono.

-- 1) PREVIEW — rode isso primeiro e confira antes de aplicar o UPDATE abaixo.
select
  s.id,
  s.name as nome_atual,
  t.number as numero_territorio_atual,
  regexp_replace(s.name, '^[0-9]+(-.*)$', t.number || '\1') as nome_corrigido
from subdivisions s
join territories t on t.id = s.territory_id
where s.name ~ '^[0-9]+-'
  and regexp_replace(s.name, '^[0-9]+(-.*)$', t.number || '\1') <> s.name
order by t.number, s.name;

-- 2) UPDATE — só depois de revisar o preview acima.
-- update subdivisions s
-- set name = regexp_replace(s.name, '^[0-9]+(-.*)$', t.number || '\1'),
--     updated_at = now()
-- from territories t
-- where t.id = s.territory_id
--   and s.name ~ '^[0-9]+-'
--   and regexp_replace(s.name, '^[0-9]+(-.*)$', t.number || '\1') <> s.name;
