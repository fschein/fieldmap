# Mistakes.md

Registro de bugs difíceis e lições aprendidas, pra não repetir o mesmo caminho errado da próxima vez. Cada entrada: o que pareceu ser o problema, o que era de fato, e a lição geral.

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
