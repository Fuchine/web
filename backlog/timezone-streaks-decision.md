# backlog: Streaks/metas usam a TZ do servidor — deploy em UTC desloca o "dia"

**Date:** 2026-07-06
**Feature:** Stats / Produção
**Status:** RESOLVED (2026-07-09) — decision: **pin instance timezone** (option
1). `TZ: ${TZ:-America/Sao_Paulo}` on the web and worker compose services (kept
identical so their day buckets match); `.env.example` documents it ("defines
'today' for streaks — set your local zone"). Verified `docker compose config`
resolves it. Per-user timezone (option 2) stays deferred to real multi-zone use.

---

## Problema

Todo o bucketing diário usa a timezone **do processo Node**: `dayKey`
(`apps/web/lib/stats.ts:44-48`) formata a data local, e `bumpDailyStats` grava
`dayKey(new Date())` (`lib/progress.ts:84`) na coluna `day`. Em dev (máquina
BRT) tudo bate; num deploy em UTC — o default de qualquer container — o dia
vira às **21h no horário de Brasília**:

- estudar às 22h conta para "amanhã" → streak quebra mesmo estudando todo dia
  à noite;
- heatmap, metas diárias e o resumo de sessão deslocam junto (todos usam
  `dayKey`/`computeStreaks` — `lib/summary.ts`, futura consumação de
  `dailyGoals`).

O residual já estava anotado nos arquivos de stats/summary, mas nenhum item
OPEN era dono da decisão — e ela precisa sair **antes** do primeiro deploy,
porque trocar a TZ depois reinterpreta as linhas históricas de
`user_daily_stats`.

## Proposta

1. **Curto prazo (lançamento):** pinar a TZ da instância — `TZ` no compose/env
   (`TZ=America/Sao_Paulo` no exemplo) e documentar no `.env.example`:
   "streaks usam esta timezone". Zero código, comportamento explícito.
2. **Médio prazo (multiusuário espalhado):** timezone por usuário em
   `user_settings` (campo novo — decisão de contrato/ERD, mesma disciplina do
   `maxReviewsPerDay` em [daily-goals-not-consumed.md]), com `dayKey`
   recebendo a TZ do usuário. Só vale o custo quando houver usuários em fusos
   distintos de verdade.

## Esforço / prioridade

**S · média.** A opção 1 é uma linha de env que evita o bug de streak mais
irritante possível ("estudei e o app disse que não").

## Referências

- `apps/web/lib/stats.ts:43-48`, `lib/progress.ts:75-99`, `lib/summary.ts`
- Residuais anotados em: [stats-screen-uses-mock-data.md],
  [summary-screen-uses-mock-data.md]
- Relacionados: [daily-goals-not-consumed.md], [deploy-story-missing.md]
