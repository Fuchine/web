# backlog: Streak carrega todos os review_logs da vida em JS

**Date:** 2026-07-06
**Feature:** Stats (T2.x)
**Status:** DONE (2026-07-06)

---

## Problema

`getStats` (`apps/web/lib/stats.ts:148-160`) faz `SELECT reviewed_at FROM
review_logs WHERE user_id = $1` **sem limite de janela**, mais todos os
`created_at` de `sentence_cards`, e computa o streak em JS
(`computeStreaks`). O histórico de reviews cresce para sempre (é o ponto do
FSRS, D6): após um ano de uso são dezenas de milhares de timestamps trafegados
e mapeados por request — e a stats roda também no load da biblioteca (StatBar).

`getSessionSummary` (`lib/summary.ts:83-88`) tem o mesmo padrão, mitigado por
uma janela de 400 dias — ainda linha a linha em vez de agregado.

## Proposta

Duas opções; recomendo a segunda:

1. Agregar no SQL: `SELECT DISTINCT (reviewed_at)::date` (e o equivalente para
   cards) — reduz o tráfego para ≤1 linha por dia ativo.
2. **Derivar dias ativos de `user_daily_stats`** — 1 linha por dia por design
   (PK `(user_id, day)`), já com writers para reviews, mineração e imersão.
   Resolve na mesma passada o [streak-ignores-watch-days.md] (dias só de
   imersão passam a contar), que é a mesma região de código.

Atenção ao fuso: `day` em `user_daily_stats` usa `dayKey` local do processo —
consistente com o comportamento atual do Stats.

## Esforço / prioridade

**S · média-alta.** Pequeno, remove a única query O(histórico-inteiro) do app e
destrava um item de produto já aberto no mesmo commit.

## Referências

- `apps/web/lib/stats.ts:148-160` (`getStats`), `lib/summary.ts:83-88`
- Writers: `apps/web/lib/progress.ts` (`bumpDailyStats`)
- Relacionado (mesmo fix): [streak-ignores-watch-days.md]

---

## Atualização (2026-07-06, pós-PR #16)

O PR #16 resolveu o [streak-ignores-watch-days.md] adicionando os dias de
imersão via `user_daily_stats` — **mas os dois scans sem limite continuam**
(`stats.ts:165-172`: todos os `review_logs` + todos os `sentence_cards` do
usuário, linha a linha, para derivar dias de review/mining).

A proposta fica mais simples do que a original: como `reviews_done` e
`cards_created` também são bumpados em `user_daily_stats` (writers de
2026-07-04), os dias ativos podem vir **exclusivamente** da query de
`user_daily_stats` que o #16 já adicionou (1 linha por dia ativo) — as duas
queries unbounded podem ser removidas. Ressalva: dias de review anteriores aos
writers (antes de 2026-07-04) não existem em `user_daily_stats`; um backfill
único a partir de `review_logs` preserva os streaks históricos.

## Resolução (2026-07-06)

- `getStats` (`lib/stats.ts`): removidos os dois scans O(histórico)
  (`review_logs` + `sentence_cards`). `dailyRows` agora traz também
  `cards_created`/`reviews_done`, e os dias ativos do streak saem **só** de
  `user_daily_stats` (`ms>0 || lines>0 || cards>0 || reviews>0`). O overlay de
  imersão do heatmap passou a usar o mesmo critério (consistência streak↔heatmap;
  dia só de mineração agora aparece com nível ≥1). Nenhuma query nova por request.
- Backfill histórico: `apps/worker/src/scripts/backfill-daily-stats.ts`
  (`pnpm --filter @fuchine/worker backfill:daily-stats`). Idempotente e
  auto-reconciliador — recomputa `reviews_done`/`cards_created` por (usuário, dia
  local) a partir das tabelas-fonte e faz upsert, **sem tocar** em
  `ms_watched`/`lines_seen` (só-beacon). Bucketa por dia no fuso local do
  processo (espelha o `dayKey` do web) — rodar no mesmo TZ do app.

Verificado: `pnpm typecheck` (8/8) + `pnpm test` (120 web incl. `stats.test.ts`)
verdes. O backfill em si depende de banco (não rodado aqui).
