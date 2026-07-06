# backlog: Fila de revisão repete o wordEntriesMap inteiro em cada card

**Date:** 2026-07-06
**Feature:** Review (F1, T1.7)
**Status:** OPEN

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

## Esforço / prioridade

**S · baixa.** Funciona hoje; é desperdício puro de payload/serialização, fix
mecânico.

## Referências

- `apps/web/lib/cards.ts:87-117`, `apps/web/app/review/review-view.tsx`
- `apps/web/app/api/review/queue/route.ts`
