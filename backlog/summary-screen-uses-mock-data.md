# backlog: Summary Screen — Data Is Still Mock/Fake

**Date:** 2026-06-24 · **Updated:** 2026-06-30
**Feature:** Session Summary (T2.x)
**Status:** RESOLVED (data wired, timestamp-based session) — RESIDUAL below

---

## Resolução (2026-06-30)

`apps/web/lib/summary.ts` (`getSessionSummary`) agrega a sessão de review real;
`summary-view.tsx` recebe os dados via prop do server component
(`summary/page.tsx`). Sem mais mocks.

**Modelo de sessão sem mudança de schema (timestamp proxy):** o Review captura
o horário de início ao clicar "Review now" e redireciona para
`/summary?since=<ISO>` ao terminar (`review-view.tsx`). Se `since` ausente, a lib
faz sessionization por gap (>30 min separa sessões, `resolveSessionStart`).

| Métrica | Fonte real |
|---|---|
| Cards reviewed | `count(distinct card_id)` em `review_logs` na janela |
| Time | span primeiro→último review da sessão |
| Retention | `grade >= 3` / total na sessão |
| Grade breakdown (Again/Hard/Good/Easy) | `review_logs` group by grade |
| Streak / 7-day activity | dias com review (`computeStreaks` + set de dias) |
| Words matured | `sentence_cards` state=2 tocados na sessão → último token com `wordEntryId` (surface/reading) + gloss de `word_entries` |

`resolveSessionStart` coberto por `lib/summary.test.ts`. Empty states adicionados.

## Residual (não bloqueia)

- **Sem coluna `session_id`** — a sessão é derivada de timestamp. Suficiente para
  o MVP; se um dia precisar de sessões nomeadas/históricas, adicionar
  `session_id` a `review_logs` e agregar por ele.
- **"Words matured" é heurístico** — usa o último token com entrada de dicionário
  do card (mesma heurística do cloze), não um conceito de "word mastery" próprio.
- **"Keep immersing"** ainda aponta para `/` (biblioteca). Poderia deep-linkar
  para o próximo vídeo recomendado.
- **Fuso**: bucketing de dias usa a TZ local do processo. Consistente com o Stats;
  reconciliar se o deploy usar TZ diferente do usuário.
