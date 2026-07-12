# backlog: Metas diárias persistem mas nada as consome

**Date:** 2026-07-04 · **Updated:** 2026-07-12
**Feature:** Metas diárias (Settings / Dashboard / Review)
**Status:** RESOLVED (2026-07-12) — fila de review + `maxReviewsPerDay`
(2026-07-05), dashboard de progresso do dia e **onboarding de metas**
(2026-07-12) feitos. Nada aberto.

---

## Resolução do onboarding (2026-07-12)

Novo passo "Daily goals" no fluxo de onboarding (`onboarding-view.tsx`, entre
language e key): dois steppers on-brand (compostos do mesmo padrão do
`settings-view`) para **New cards per day** (default 20) e **Watch time per day**
(default 20 min). O passo é opcional/pulável como os demais; só grava
`dailyGoals` quando o usuário passa por ele (Continue → `goalsSet`), então pular
antes não seta metas. A rota `/api/onboarding` já repassava o body inteiro ao
`updateSettings` (que valida/mescla `dailyGoals`) — **nenhuma mudança de
backend**. Verificado: typecheck 8/8. Não dirigido ao vivo (precisa de sessão
com usuário novo não-onboarded).

---

## Resolução parcial (2026-07-12) — dashboard consome as metas

`getDailyProgress(db, userId)` (`lib/goals.ts`) pareia cada meta **definida** com
o progresso de hoje: `newCardsPerDay` × introduções (review_logs state=0),
`maxReviewsPerDay` × reviews (state≠0) — mesmo split da `dailyAllowances` — e
`watchMinutesPerDay` × `user_daily_stats.msWatched` de hoje. As queries são
gated (só busca a fonte de cada meta setada); sem meta → `[]`. `reviewMinutesPerDay`
é **omitido de propósito**: não há rastreio de tempo de review (fonte
inexistente — anotar se/quando virar requisito). O core puro `buildDailyProgress`
é testado em `lib/goals.test.ts` (6). O dashboard (`app/page.tsx` →
`DashboardView`) renderiza uma seção "Today's goals" (barra done/goal por meta,
clampada, marca ✓ ao bater) só quando há metas. Verificado: typecheck 8/8 +
`pnpm test` (154 web). Não dirigido ao vivo (precisa de DB + sessão + metas
setadas). Nota: a seção reusa o vocabulário visual existente do dashboard; o
polimento fino pode passar pelo Claude Design.

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
- ~~**Dashboard**: mostrar progresso do dia vs meta~~ — **FEITO 2026-07-12**
  (`getDailyProgress` + seção "Today's goals"; ver Resolução parcial acima).
- ~~**Onboarding**: metas configuráveis no onboarding~~ — **FEITO 2026-07-12**
  (passo "Daily goals"; ver Resolução do onboarding acima).

### 2. Campo "Maximum reviews per day" — ✅ FEITO 2026-07-05

`maxReviewsPerDay` adicionado a `DailyGoals` (`packages/db/src/types.ts`) —
mudança só no tipo do contrato jsonb, **sem migration** (vive em
`user_settings.daily_goals`, já sancionado). Validado em `lib/settings.ts`
(teto 9999, testado em `settings.test.ts`), consumido em `getReviewQueue`
(`dailyAllowances` conta reviews de hoje via `review_logs` com `state ≠ 0` e
limita os cards due surfados), e o stepper de `/settings` agora persiste.

## Referências

- `lib/settings.ts` (parse/merge), `settings-view.tsx` (steppers)
- `lib/progress.ts` (`bumpDailyStats`) — fonte dos contadores do dia
