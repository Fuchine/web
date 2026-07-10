# backlog: Beacon pode inflar `user_word_stats.views` sem cap diário (auto-sabotagem)

**Date:** 2026-07-10
**Feature:** Stats / Progresso
**Status:** CLOSED (2026-07-10) — aceito como não-problema. Impacto restrito ao próprio usuário (auto-sabotagem das próprias métricas), sem custo, sem efeito cross-user, sem tocar cache compartilhado. Os guards que importam já existem (ownership das lines, rate limit, teto por beacon).

---

## Problema

`ms_watched` satura num teto diário (`MS_WATCHED_DAILY_MAX`,
`apps/web/lib/progress.ts:27`); `bumpWordViews` (`:108-124`) não tem cap
nenhum e roda fora da transação de `bumpDailyStats` (`:171-174`). Dentro do
rate limit do beacon (3/15s) e do teto de 500 lineIds/beacon, um loop
scriptado infla `views` das palavras do próprio vídeo — e `views ≥ 5` marca a
palavra como "known" no comprehension.

**Impacto restrito ao próprio usuário**: sem custo, sem efeito cross-user, sem
tocar cache compartilhado. É auto-sabotagem das próprias métricas. Os guards
que importam já existem (ownership das lines, rate limit, teto por beacon).

## Proposta

Opcional — **aceitar como não-problema é uma resolução válida**. Se for mexer:

- cap diário de incremento de `views` análogo ao de `ms_watched`, e/ou
- juntar `bumpWordViews` à transação do beacon por consistência.

## Esforço / prioridade

**S · baixa.** Polimento de integridade de métricas; decidir aceitar e fechar
também resolve.

## Referências

- `apps/web/lib/progress.ts:19-27` (caps), `:107-124` (`bumpWordViews`),
  `:171-174` (chamadas separadas)
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (B2); sucessor do histórico de
  `stats-writers-daily-caps` (resolvido e removido)
