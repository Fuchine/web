# backlog: Writers de stats sem teto diário — métricas fabricáveis

**Date:** 2026-07-06
**Feature:** Progresso / Stats (writers)
**Status:** RESOLVED (2026-07-09) — item 1 (24h clamp) done 2026-07-07; items
2–3 wired now. `RATE_LIMITS` gains `progressBeacon` (1/10s per user) and
`wordClick` (1/60s per user+word); the progress and dictionary-click routes
enforce them and, on deny, return **200 + `{throttled:true}`** (discard, never
429) so the player never breaks. Limiter fails open (a Redis blip can't drop
legit beacons).

---

## Problema

Os caps dos writers de atividade valem **por request**, não por dia:

1. `recordProgress` valida ≤10 min e ≤500 linhas *por beacon*
   (`apps/web/lib/progress.ts:20-21`), mas nada limita a frequência de
   beacons: um script com o cookie da sessão posta em loop e infla
   `ms_watched`/`lines_seen`/`views` sem limite — 200 beacons cheios = +33h de
   "watch time" num único dia (`bumpDailyStats` só soma,
   `lib/progress.ts:75-99`).
2. `recordWordClick` (`lib/progress.ts:177-200`) incrementa `clicks` sem teto
   algum.

O dano é majoritariamente ao próprio usuário (streak, heatmap e watch time
falsos), mas vaza do auto-dano em dois pontos:

- `user_word_stats.views` alimenta a heurística de "known" da comprehension
  (`views >= 5` — `lib/study.ts:38,54`): inflar views marca o catálogo inteiro
  como compreendido e o indicador da biblioteca perde o sinal.
- Qualquer feature futura que leia essas tabelas (recomendação por nível,
  biblioteca pública com stats, streaks — F2/F3) herda números fabricáveis.

## Proposta

1. **Clamp no write side** (uma linha, sem infra): no upsert de
   `bumpDailyStats`, `ms_watched` do dia satura em 24h —
   `LEAST(ms_watched + excluded.ms_watched, 86400000)`. Sanidade absoluta
   independente de rate limit.
2. **Frequência do beacon:** 1 beacon/10s por usuário no mesmo bucket Redis de
   [ai-endpoints-no-rate-limit.md] (o player legítimo flusha a cada 15s;
   excesso responde 200 e descarta, sem quebrar o player).
3. **Clicks:** contar no máximo 1 incremento por (user, word) por minuto —
   cliques repetidos no mesmo popup não são sinal de estudo.

## Resolução parcial (2026-07-07)

**Item 1 (feito).** `bumpDailyStats` (`lib/progress.ts`) satura o `ms_watched`
acumulado do dia em 24h no upsert:
`LEAST(ms_watched + excluded.ms_watched, 86_400_000)` (constante
`MS_WATCHED_DAILY_MAX`). Sanidade absoluta independente de rate limit — nenhum
loop de beacons infla o watch time além de um dia real. Mudança SQL (sem seam de
teste unitário puro; coberta por typecheck, comportamento validado com DB).

**Itens 2–3 (destravados, ainda não ligados).** Frequência de beacon (1/10s) e
dedup de clicks (1/(user,word)/min) dependiam do bucket Redis de
[ai-endpoints-no-rate-limit.md] — **o limiter já existe** (`lib/rate-limit.ts`,
`enforceRateLimit`). Falta só ligá-los nos writers, com uma diferença de
tratamento: beacon/click negados respondem **200 e descartam** (não 429) para
não quebrar o player. Adicionar as ações `progressBeacon` (1/10s) e `wordClick`
(1/60s por (user,word)) em `RATE_LIMITS`.

## Esforço / prioridade

**S · baixa.** Hoje é auto-dano; sobe para média quando stats alimentarem
recomendação ou qualquer superfície pública/social. O item 1 vale fazer já
(custo zero); 2–3 pegam carona na infra do limiter.

## Referências

- `apps/web/lib/progress.ts:20-21, 75-99, 177-200`
- `apps/web/lib/study.ts:38` (heurística "known" por views)
- Relacionados: [ai-endpoints-no-rate-limit.md],
  [library-comprehension-full-scan.md], [streak-ignores-watch-days.md]
