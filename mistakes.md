# Mistakes.md

Registro de bugs difíceis e lições aprendidas, pra não repetir o mesmo caminho errado da próxima vez. Cada entrada: o que pareceu ser o problema, o que era de fato, e a lição geral.

---

## Rodando migrations do zero (staging): `relation "public.groups" does not exist`

**Sintoma:** montando o ambiente de staging (banco novo), migration `015-add-groups-to-profiles.sql` falhava com `42P01: relation "public.groups" does not exist`.

**Causa real:** terceira ocorrência da mesma classe de bug desta sessão (ver `delivered_at` e o cast de tipo do link de campo) — a tabela `groups` inteira nunca existiu em nenhuma migration. Foi criada direto no painel do Supabase antes de `015-add-groups-to-profiles.sql`/`017-add-group-id-to-assignments.sql` começarem a referenciá-la, e ninguém percebeu porque em produção ela já existia por fora do histórico versionado. Reconstruída em `015-create-groups-table.sql` a partir do tipo `Group` em `lib/types.ts` e do padrão de policies já usado por `campaigns`/`territories` em `001-create-tables.sql` (policies com subquery em `profiles`, não com `is_admin()` — esse helper só existe a partir da migration 043, não podia ser usado numa tabela criada antes disso na cadeia).

**Lição geral:**
- **Confirma o padrão**: três causas-raiz seguidas nesta mesma sessão de setup de staging foram todas "objeto criado no painel do Supabase, nunca virou migration". Rodar as migrations do zero num banco vazio é a única forma de achar esse tipo de buraco de forma sistemática — vale fazer isso preventivamente de vez em quando, não só quando um ambiente novo precisa ser criado.
- Ao reconstruir um objeto assim, prestar atenção em qual *época* da cadeia de migrations ele pertence — usar um helper/padrão de uma migration posterior (como `is_admin()`, que só existe a partir da 043) numa migration reconstruída pra rodar mais cedo na sequência quebra tudo de novo, de um jeito diferente.

---

## `001-create-tables.sql` falhava num banco novo: `column "delivered_at" does not exist`

**Sintoma:** rodando as migrations do zero num projeto Supabase novo (criação do ambiente de staging), `001-create-tables.sql` falhava com `42703: column "delivered_at" does not exist`, logo na criação do índice `idx_assignments_delivered_at`.

**Causa real:** a mesma classe de problema do `territories.number` (ver entrada do link de campo) — schema drift entre o banco de produção e as migrations versionadas. `assignments.delivered_at` existe em produção (usado em `041-enable-rls-blocks-units.sql` e referenciado em `lib/types.ts`), mas foi adicionado direto pelo painel do Supabase em algum momento, nunca virou uma migration. `001-create-tables.sql` cria o índice e uma policy que dependem da coluna, mas nunca a declara no `CREATE TABLE assignments`. Só nunca deu erro em produção porque a coluna já existia lá por fora do controle de versão — um banco novo, rodando só o que está no git, expõe o buraco.

**Fix:** adicionada a coluna `delivered_at TIMESTAMPTZ` no `CREATE TABLE assignments` de `001-create-tables.sql`.

**Lição geral:**
- **Um ambiente de staging criado do zero é o jeito mais confiável de achar schema drift** — production acumula colunas/tabelas criadas via UI do Supabase que nunca voltam pra uma migration. Rodar as migrations numa instância nova e vazia é literalmente um teste de "as migrations versionadas descrevem o banco real?" — vale considerar isso rotina, não só quando dá erro.
- Sempre que um erro `column "X" does not exist` aparecer rodando migrations do zero, a causa quase certa é essa: a coluna existe em produção mas nunca foi declarada em nenhuma migration — não adianta procurar em outro lugar, é achar onde ela deveria ter sido criada e adicionar lá.

---

## Link de campo (`/campo/[token]`) sempre mostrava "Link inválido" (erro de tipo mascarado)

**Sintoma:** qualquer link de campo gerado (residencial ou condomínio) mostrava "Link inválido ou expirado" pra quem abria, mesmo recém-criado. A primeira suspeita razoável — "deve ser o link apontando pra localhost" — não era a causa: o mesmo erro acontecia abrindo em produção.

**Causa real:** a RPC `get_field_link_units` falhava com erro Postgres `42804` — `"Returned type character varying(10) does not match expected type text in column 4"`. A função declara `territory_number TEXT` no `RETURNS TABLE`, mas `territories.number` no banco é `character varying(10)` — em algum momento a coluna foi alterada fora das migrations rastreadas (a migration original, `001-create-tables.sql`, declara `TEXT`). Postgres não faz coerção implícita disso dentro de `RETURN QUERY`.

O código do cliente (`app/campo/[token]/page.tsx`) tratava qualquer `error` da chamada RPC do mesmo jeito que "link genuinamente não existe" — `rows` ficava vazio, e a tela mostrava a mensagem genérica de link inválido tanto pra um ID errado quanto pra um erro 500 real do banco. Isso escondeu a causa por várias rodadas de teste.

**Fix:** cast explícito `t.number::TEXT` (e demais colunas de texto, defensivamente) na função (`scripts/050-fix-field-link-number-type.sql`).

**Lição geral:**
- Quando uma RPC do Supabase falha com "structure of query does not match function result type" (42804), é sempre incompatibilidade entre o tipo declarado no `RETURNS TABLE` e o tipo real da coluna de origem — não adianta procurar em outro lugar, é conferir os tipos das colunas envolvidas contra o schema do banco AO VIVO, não contra o que a migration original declarava (colunas podem ter sido alteradas depois, fora de qualquer migration rastreada).
- **Nunca engolir o `error` de uma chamada RPC/query e cair num estado genérico de "não encontrado".** Um erro real de servidor (500/400) e um "recurso não existe" (404 lógico) são coisas diferentes e merecem mensagens diferentes — misturar os dois transforma qualquer bug de backend em uma pista falsa ("deve ser algo no meu ambiente/link") que desvia a investigação.
- Antes de assumir "só vai funcionar quando publicar" (ambiente), teste a mesma chamada em produção e localhost — se falha igual nos dois, não é ambiente.

---

## Leaflet: polígonos "somem" em dev, sem erro nenhum (Strict Mode + refs órfãs)

**Sintoma:** `TerritoryMapViewer` (mapa do publicador em `/dashboard/my-assignments/[id]/map`) não mostrava os polígonos das quadras — às vezes um zoom/posição estranho, às vezes nada, sem exceção nem erro de query. O editor do admin (`components/map/territory-map.tsx`), usando os mesmos dados, funcionava normalmente.

**Hipóteses erradas testadas antes da causa real** (cada uma pareceu plausível e nenhuma resolveu sozinha):
1. Heurística de troca lat/lng por faixa numérica — removida, não era a causa.
2. `coordinates` com anéis extras inflando o bounding box do `fitBounds` — restringido a `coordinates[0]`, não era a causa.
3. Tamanho do container medido errado por causa do layout flex + `next/dynamic` — `invalidateSize()` antes do `fitBounds`, depois `requestAnimationFrame` — não era a causa (o log provou que o tamanho já estava correto).

**Causa real, encontrada só depois de instrumentar com `console.log` e contar `<path>` no DOM:**
- Next.js roda em **React Strict Mode** por padrão em dev (sem `reactStrictMode: false` no `next.config.js`), que **monta → desmonta → monta de novo** cada efeito de propósito, pra expor bugs de cleanup.
- O efeito que cria o mapa (`L.map(...)`) roda duas vezes: cria mapa A, destrói (`map.remove()`), cria mapa B.
- O efeito que desenha os polígonos guarda o grupo de camadas numa ref criada só uma vez: `if (!overlayGroupRef.current) { overlayGroupRef.current = L.layerGroup().addTo(map) }`.
- Na segunda montagem, essa ref **já não é null** — continua apontando pro grupo preso ao mapa A, já destruído. Os polígonos são adicionados a esse grupo órfão: nenhum erro, nenhum warning, simplesmente não aparecem em lugar nenhum porque o grupo não está mais ligado a nenhum mapa visível.
- Confirmado via log: 5 polígonos criados em JS, mas só 1 `<path>` real no DOM; na segunda execução do efeito, `polygon.getElement()` retornava `undefined`.

**Fix:** resetar toda ref que é criada condicionalmente (`if (!ref.current)`) dentro de um efeito, no cleanup do efeito que criou o recurso "pai" (aqui, o `map.remove()`):

```js
return () => {
  map.remove()
  mapRef.current = null
  overlayGroupRef.current = null   // sem isso, sobrevive à remontagem do Strict Mode
  polygonsRef.current = null
}
```

**Lição geral:**
- Em qualquer componente Leaflet (ou qualquer lib imperativa que amarra objetos a um container DOM via ref), **toda ref derivada do mapa/instância precisa ser resetada no mesmo cleanup que destrói o mapa** — não só a ref do próprio mapa. Um padrão `if (!algumaRef.current) { algumaRef.current = criarAlgoLigadoAoMapa() }` sem reset correspondente é uma bomba-relógio: funciona na primeira montagem e falha silenciosamente em qualquer remontagem (Strict Mode em dev, ou navegação real em produção).
- **Não empilhar correções sem confirmar cada uma.** Três tentativas (heurística, anéis, tamanho de container) foram aplicadas em sequência sem prova de que resolviam antes de passar pra próxima — isso é sintoma de estar corrigindo no escuro. A virada só veio ao parar de "tentar mais uma coisa" e instrumentar (contar `<path>` reais no DOM vs. objetos JS criados) pra ver o dado real.
- **"Funciona no editor do admin mas não no mapa do publicador"** era o sinal certo desde o início: comparar contra uma referência que funciona (`territory-map.tsx`) mais cedo teria acelerado a investigação — a referência já tinha `animate: false` no `fitBounds`, por exemplo.
- Um `console.error` dentro de um `try/catch` silencioso pode mascarar exatamente esse tipo de falha "sem erro" — vale sempre checar contagem de elementos reais no DOM (`document.querySelectorAll(...)`) quando o dado parece certo mas a tela não bate.
