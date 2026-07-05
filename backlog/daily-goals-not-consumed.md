# backlog: Metas diárias persistem mas nada as consome

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Metas diárias (Settings / Dashboard / Review)
**Status:** PARTIAL — fila de review resolvida (2026-07-05); dashboard,
onboarding e o campo `maxReviewsPerDay` ainda abertos

---

## Resolução parcial (2026-07-05)

**Fila de revisão respeita `newCardsPerDay`.** `getReviewQueue` (`lib/cards.ts`)
agora separa cards já introduzidos (state ≠ 0, nunca limitados) de cards novos
(state 0) e libera novos até o saldo do dia:

- `newCardsRemainingToday` lê `dailyGoals.newCardsPerDay` de `user_settings` e
  conta introduções de hoje via `review_logs` com `state = 0` (o estado *antes*
  da primeira review — exatamente uma linha por card novo). Saldo =
  `max(0, cap − introduzidos)`. Sem meta definida → `null` = ilimitado
  (comportamento antigo preservado).
- A fila retorna reviews primeiro, depois os novos permitidos, e corta em
  `limit`.

Verificado por typecheck + testes unitários (o E2E `e2e-mine-sentence` — usuário
sem meta — continua vendo os 2 cards).

## Contexto

Desde 2026-07-04, `PATCH /api/settings` aceita `dailyGoals` (validação com teto
por campo, merge parcial no jsonb, `null` limpa) e o stepper "New cards per
day" em `/settings` persiste `newCardsPerDay`. Os contadores diários existem em
`user_daily_stats` (writers shipped no mesmo dia).

## O que falta

### 1. Consumir as metas (destravado, só código)

- ~~**Fila de revisão**: respeitar `newCardsPerDay`~~ — **FEITO 2026-07-05**
  (ver Resolução parcial). Ainda pode considerar `reviewMinutesPerDay`/
  `watchMinutesPerDay` onde fizer sentido.
- **Dashboard**: mostrar progresso do dia vs meta (`user_daily_stats` de hoje ×
  `dailyGoals`) — "quantas revisões hoje / meta" é elemento-chave do inventário.
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
