# backlog: Streak carrega todos os review_logs da vida em JS

**Date:** 2026-07-06
**Feature:** Stats (T2.x)
**Status:** OPEN

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
