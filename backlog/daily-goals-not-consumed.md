# backlog: Metas diárias persistem mas nada as consome

**Date:** 2026-07-04
**Feature:** Metas diárias (Settings / Dashboard / Review)
**Status:** OPEN — parte destravada (consumo), parte em decisão (campo novo)

---

## Contexto

Desde 2026-07-04, `PATCH /api/settings` aceita `dailyGoals` (validação com teto
por campo, merge parcial no jsonb, `null` limpa) e o stepper "New cards per
day" em `/settings` persiste `newCardsPerDay`. Os contadores diários existem em
`user_daily_stats` (writers shipped no mesmo dia).

## O que falta

### 1. Consumir as metas (destravado, só código)

- **Dashboard**: mostrar progresso do dia vs meta (`user_daily_stats` de hoje ×
  `dailyGoals`) — "quantas revisões hoje / meta" é elemento-chave do inventário.
- **Fila de revisão**: respeitar `newCardsPerDay` ao introduzir cards novos
  (`getReviewQueue` em `lib/cards.ts` hoje ignora metas) e considerar
  `reviewMinutesPerDay`/`watchMinutesPerDay` onde fizer sentido.
- **Onboarding**: o inventário prevê metas configuráveis no onboarding; o
  fluxo atual não pergunta.

### 2. Campo "Maximum reviews per day" (decisão de contrato)

O segundo stepper de `/settings` ("Maximum reviews per day") segue estático:
`DailyGoals` (packages/db/src/types.ts) só tem `newCardsPerDay`,
`reviewMinutesPerDay`, `watchMinutesPerDay` — não há campo de cap de reviews.
Adicionar `maxReviewsPerDay` é mudança no tipo do contrato (jsonb, sem
migration, mas passa pela mesma disciplina de schema).

## Referências

- `lib/settings.ts` (parse/merge), `settings-view.tsx` (steppers)
- `lib/progress.ts` (`bumpDailyStats`) — fonte dos contadores do dia
