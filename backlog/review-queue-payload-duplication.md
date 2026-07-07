# backlog: Fila de revisão repete o wordEntriesMap inteiro em cada card

**Date:** 2026-07-06
**Feature:** Review (F1, T1.7)
**Status:** DONE (2026-07-07)

---

## Problema

`getReviewQueue` (`apps/web/lib/cards.ts:105-117`) monta **um**
`wordEntriesMap` (todas as entradas de dicionário de todas as linhas da fila,
com `definitions` completas) e o anexa **em cada card** do array retornado:

```ts
return rows.map((r) => ({ ..., wordEntriesMap }));
```

Em JS é a mesma referência; serializado (response de `GET /api/review/queue` e
props do server component da página de review) o mapa é **repetido N vezes** —
com a fila padrão de 20 cards, ~95% do payload é duplicata. Definições JMdict
são grandes (múltiplos sentidos/glosses), então isso facilmente multiplica um
payload de dezenas de KB para o de MB.

## Proposta

Retornar `{ cards, wordEntries }` no topo (mapa único), ajustando os dois
consumidores (rota + `review-view.tsx`) para indexar `wordEntries[id]`.
Aproveitar para selecionar só os campos de definição que a UI usa.

## Resolução (2026-07-07)

`getReviewQueue` agora retorna `{ cards, wordEntries }` (mapa único no topo) em
vez de anexar `wordEntriesMap` em cada card. A montagem virou o helper puro e
testado `buildReviewQueuePayload(rows, entries)` em `lib/cards.ts`.

Consumidores ajustados sem tocar no contrato público do `@fuchine/ui`
(`ReviewSession`/`ReviewItem` seguem com `wordEntriesMap` por item):

- `GET /api/review/queue` responde `{ cards, wordEntries }`.
- `app/review/page.tsx` desestrutura e passa os dois; badge usa `cards.length`.
- `app/review/review-view.tsx` (client) **re-anexa a referência compartilhada**
  (`{ ...c, wordEntriesMap: wordEntries }`) ao montar o `ReviewItem[]` — todos os
  cards apontam para o mesmo objeto, zero bytes duplicados no fio e nas props RSC.
- **Bônus:** `app/albums`, `app/albums/[id]` e `app/phrases` chamavam
  `getReviewQueue(...).length` só para o badge — trocados por `countDueCards`
  (mesma correção de overfetch do [library-dashboard-overfetch.md], que só tinha
  pego dashboard/biblioteca). `scripts/e2e-mine-sentence.ts` usa `.cards`.

Testes novos (`lib/cards.test.ts`, 4): mapa único (sem `wordEntriesMap` por card),
mapeamento de clip/sentence/tokens/intervals, defaults de reading/pos nulos,
tokens nulos. `pnpm test` (137 web) + `pnpm typecheck` (8/8) verdes.

## Esforço / prioridade

**S · baixa.** Funciona hoje; é desperdício puro de payload/serialização, fix
mecânico.

## Referências

- `apps/web/lib/cards.ts:87-117`, `apps/web/app/review/review-view.tsx`
- `apps/web/app/api/review/queue/route.ts`
