# Mistakes.md

Registro de bugs difíceis e lições aprendidas, pra não repetir o mesmo caminho errado da próxima vez. Cada entrada: o que pareceu ser o problema, o que era de fato, e a lição geral.

---

## `DROP SCHEMA public CASCADE` (reset de staging) quebrou a `service_role`: "permission denied for table profiles"

**Sintoma:** depois de resetar o schema `public` do banco de staging (pra rodar as migrations do zero, de novo), criar usuários via Admin API funcionou (a trigger `handle_new_user` rodou certinho), mas ajustar o `role` do perfil via `service_role` falhou com `permission denied for table profiles` — mesmo a `service_role` sendo feita pra ignorar RLS.

**Causa real:** `GRANT`/`REVOKE` (permissão bruta na tabela) e RLS (política de linha) são **duas camadas independentes** no Postgres. A `service_role` tem o atributo `BYPASSRLS`, mas ainda precisa do `GRANT` explícito na tabela pra sequer tentar acessá-la. O Supabase configura esses grants automaticamente quando cria um projeto novo (fora de qualquer migration, é parte do provisionamento da plataforma) — meu `DROP SCHEMA public CASCADE` (pra resetar antes de re-rodar as migrations) apagou tudo isso junto, e nenhuma das 47 migrations recria esses grants porque nunca precisaram (rodaram todas contra um schema que o Supabase já tinha configurado certo).

**Fix:** depois de `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, reconceder manualmente antes de rodar qualquer migration:
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
```

**Lição geral:**
- `DROP SCHEMA public CASCADE` num projeto Supabase não é um reset "limpo" — ele apaga configuração da PLATAFORMA (grants de `service_role`/`anon`/`authenticated`), não só o que suas migrations criaram. Qualquer script de "reset e recria do zero" pra um projeto Supabase precisa reconceder isso explicitamente logo depois do `CREATE SCHEMA`, ou vai parecer que RLS está bloqueando algo que na verdade nunca teve permissão nenhuma pra começo de conversa.
- `"permission denied for table X"` (mensagem genérica de falta de GRANT) é um erro **diferente** de uma RLS negando silenciosamente (que normalmente retorna zero linhas, não erro) — se aparecer esse texto específico usando a `service_role`, é sempre GRANT faltando, nunca RLS.

---

## `handle_new_user()` inseria em coluna `name`, que não existe (`full_name`)

**Sintoma:** ia criar os usuários de teste no staging e percebi, revisando a trigger de criação automática de perfil, que ela quebraria — não é drift de produção dessa vez, é uma inconsistência real dentro das próprias migrations.

**Causa real:** a função `handle_new_user()` (dispara ao criar um usuário no Supabase Auth, insere a linha em `profiles`) é redefinida **quatro vezes** ao longo da história (`001`, `004`, `007`, `009` — sempre a última `CREATE OR REPLACE` vale). `001-create-tables.sql` cria a tabela `profiles` já com a coluna `full_name`, e `004-fix-schema.sql` corrige a função pra usar `full_name` — mas `007-create-profile-trigger.sql` e `009-add-must-change-password.sql`, escritos depois, voltam a usar `name` (a coluna errada/antiga), desfazendo a correção da 004. Como 009 é a última a rodar, a versão que fica valendo de verdade é a quebrada. `001` também tinha um fallback de role pra `'user'`, que nem está na lista de roles válidas.

**Fix:** `full_name` em vez de `name` nas quatro versões da função (001, 004 já estava certo, 007, 009), e o fallback de role trocado pra `'publicador'`.

**Lição geral:**
- Quando uma função/trigger é redefinida várias vezes ao longo do histórico de migrations, **só a última versão importa pro comportamento real** — mas isso também significa que um erro introduzido numa redefinição posterior silenciosamente desfaz uma correção anterior, sem nenhum aviso (`CREATE OR REPLACE` nunca reclama). Vale sempre olhar a **última** definição de qualquer função redefinida várias vezes, não assumir que "já foi corrigido antes" é suficiente.
- Isso não apareceria rodando as migrations sozinho — só quebra quando alguém de fato tenta criar um usuário novo (a função só executa nesse momento). Testar a app de ponta a ponta (não só "as migrations rodaram sem erro") é a única forma de pegar esse tipo de bug.

---

## `profiles_role_check` nunca aceitava `'supervisor'` (quarta ocorrência do mesmo drift)

**Sintoma:** ia criar um usuário de teste com role `supervisor` no staging recém-criado e percebi, revisando o schema, que `profiles_role_check` só permite `'admin', 'dirigente', 'publicador'`. Teria falhado com violação de CHECK constraint na hora do INSERT.

**Causa real:** quarta ocorrência da mesma classe de bug desta sessão (`delivered_at`, a tabela `groups`, e o cast de tipo do link de campo) — o papel `supervisor` foi adicionado direto no painel do Supabase em produção quando essa role foi criada, e a constraint em `004-fix-schema.sql` nunca foi atualizada pra refletir isso, mesmo com várias migrations posteriores (030, 036, 041, 045, 047, 048, 049, 051) já assumindo `role = 'supervisor'` como valor válido em RLS policies.

**Fix:** `004-fix-schema.sql` agora inclui `'supervisor'` na constraint. Num banco que já rodou a versão antiga (staging já bootstrapado), precisa rodar manualmente:
```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'dirigente', 'publicador', 'supervisor'));
```

**Lição geral:**
- Quatro causas-raiz da mesma classe numa única sessão de setup de staging confirma que isso não é acidente isolado — é como esse projeto historicamente introduziu roles/colunas/tabelas novas (direto no painel, sem migration). Vale, antes de criar qualquer ambiente novo no futuro, rodar uma varredura ampla (grep por valores/tabelas usados no código e nas RLS policies que não aparecem em nenhum `CREATE`/`ALTER` versionado) em vez de só descobrir um de cada vez pelo erro.

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

---

## Dashboard trava em "Carregando..." pra sempre no staging (coluna `profiles.name` vs `full_name`)

**Sintoma:** `/dashboard` ficava preso na tela de loading indefinidamente rodando contra o banco de staging recém-bootstrapado; `/dashboard/schedule` (acessado direto pela URL) carregava normal. Nenhum erro visível na tela, nenhum erro no log do servidor (todo `GET /dashboard` retornava 200).

**Causa real:** `providers/auth-provider.tsx` busca o perfil com `.select("id, name, email, ...")`, e `lib/types.ts` (`Profile`) e todo o resto do app (dashboard, `house-by-house.tsx`, etc.) usam `name`. Mas a migration `scripts/004-fix-schema.sql` continha `ALTER TABLE profiles RENAME COLUMN name TO full_name`, e as migrations 001/007/009 (trigger `handle_new_user`) inseriam em `full_name` — script consistente internamente, mas nunca refletindo a realidade da produção (que sempre teve `name`; o rename do 004 nunca foi de fato aplicado lá, ou foi revertido depois via edição manual no painel do Supabase, sem registro). Isso só apareceu agora porque staging foi a primeira vez que o schema foi construído do zero **só a partir dos scripts**, sem herdar o estado real de produção.

Com a coluna errada, `fetchProfile()` falha (`column profiles.name does not exist`), `profile` fica `null` pra sempre, e o guard `if (loading || !isReady || !profile)` em `app/dashboard/page.tsx` nunca sai do estado de loading — sem exceção não tratada, sem log de servidor, porque o fetch roda 100% client-side.

**Fix:** revertidos os 4 scripts (`001`, `004`, `007`, `009`) pra usarem `name` consistentemente (removido o `RENAME COLUMN` do 004, trigger `handle_new_user` voltou a inserir em `name`). No banco de staging já bootstrapado, fix pontual: `ALTER TABLE public.profiles RENAME COLUMN full_name TO name;`.

**Lição geral:**
- Essa é mais uma instância de schema drift (a 6ª só nesta sessão) — mas dessa vez na direção contrária das anteriores: não foi algo criado no painel do Supabase e nunca capturado numa migration, foi uma migration **que existe no repo mas nunca foi (ou deixou de ser) verdade em produção**. Scripts de migration não são garantia de schema real; só bootstrapar do zero contra eles expõe a divergência.
- Quando uma tela trava em "loading" client-side sem NENHUM erro no log do servidor, o hang quase certamente está num fetch client-side que falhou silenciosamente (`.catch`/`console.warn` sem re-throw) e nunca chamou o `setLoading(false)` correspondente — abrir o console do browser primeiro, antes de investigar o server, teria resolvido em segundos.
- Ao decidir qual lado da divergência "corrigir" (renomear a migration pra bater com o app, ou mudar o app pra bater com a migration), sempre vencer o lado que tem mais superfície e já está provado funcionando em produção — aqui, 13+ lugares no app código e a produção real usavam `name`; só 4 migrations (nunca efetivamente aplicadas) diziam `full_name`.
