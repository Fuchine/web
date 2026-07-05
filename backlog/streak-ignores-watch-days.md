# backlog: Streak/heatmap só contam revisão, não imersão

**Date:** 2026-07-04
**Feature:** Stats (T2.x)
**Status:** OPEN — destravado (só código)

---

## Problema

`getStats` (`apps/web/lib/stats.ts`) deriva streak, heatmap e "dias ativos" de
`review_logs` + `sentence_cards` — decisão tomada quando `user_daily_stats`
não tinha writer. Desde 2026-07-04 o player escreve `ms_watched`/`lines_seen`
por dia, então **um dia só de imersão (assistir sem revisar) não conta para o
streak**, o que pune o comportamento central do produto.

## O que precisa

- Incluir dias com `user_daily_stats.ms_watched > 0` (ou `lines_seen > 0`) no
  set de dias ativos que alimenta `computeStreaks` e o heatmap.
- Decidir o critério de "dia ativo" (qualquer atividade? mínimo de X min?) e
  documentar no próprio lib.
- O comentário de cabeçalho do `stats.ts` ("have no writer during normal use
  yet") ficou desatualizado — ajustar na mesma passada.

## Referências

- `lib/stats.ts` (`getStats`, `computeStreaks`), `lib/progress.ts` (writers)
- Backlog relacionado: [stats-screen-uses-mock-data.md] (residual resolvido)
