# backlog: Streak/heatmap só contam revisão, não imersão

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Stats (T2.x)
**Status:** RESOLVED (2026-07-05)

---

## Resolução (2026-07-05)

`getStats` (`apps/web/lib/stats.ts`) agora busca `user_daily_stats` (histórico
completo) e trata **qualquer** dia com `ms_watched > 0` ou `lines_seen > 0` como
dia ativo:

- **Streak/best streak**: os `immersionDayKeys` entram no `activeKeys` que
  alimenta `computeStreaks`, junto de reviews e cards minerados. Um dia só de
  imersão mantém o streak.
- **Heatmap**: dias de imersão sem review recebem nível ≥ 1
  (`Math.max(heatLevel(reviews), immersionOffsets.has(offset) ? 1 : 0)`).
- **Critério de dia ativo**: qualquer atividade (sem mínimo de minutos) —
  documentado no comentário de cabeçalho do `stats.ts`.
- O comentário de cabeçalho desatualizado ("have no writer during normal use
  yet") foi reescrito.

Watch time passou a reusar o mesmo fetch de `user_daily_stats` (uma query a
menos). Verificado por typecheck + `lib/stats.test.ts` (helpers puros).

## Problema (original)

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
