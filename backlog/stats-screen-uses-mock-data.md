# backlog: Stats Screen — Data Is Still Mock/Fake

**Date:** 2026-06-24 · **Updated:** 2026-07-04
**Feature:** Stats (T2.x)
**Status:** RESOLVED (data wired; watch-time instrumentation shipped 2026-07-04)

---

## Resolução (2026-06-30)

`apps/web/lib/stats.ts` (`getStats`) agrega direto das tabelas fonte
(sempre populadas), e `stats-view.tsx` recebe os dados via prop do server
component (`stats/page.tsx`). Sem mais mocks. Fontes:

| Métrica | Fonte real |
|---|---|
| Words known / Vocabulary (known/learning/new) | `sentence_cards.state` (FSRS: 2=known, 1/3=learning, 0=new) |
| Retention (30d) | `review_logs` — `grade >= 3` / total |
| Day streak / Best streak | dias ativos de `review_logs` + `sentence_cards` (`computeStreaks`) |
| Review heatmap (17 semanas) | `review_logs` por dia → `heatLevel` |
| Top sources | `sentence_cards` JOIN `videos`, count por vídeo |
| Watch time + daily chart | `user_daily_stats.ms_watched` |

Helpers puros (`computeStreaks`, `heatLevel`) cobertos por `lib/stats.test.ts`.
Empty states adicionados (sem cards minerados, sem streak).

## Residual (não bloqueia)

- ~~**Watch time depende de `user_daily_stats`, que ainda não tem writer**~~
  **RESOLVIDO 2026-07-04**: o player agora acumula tempo/linhas e envia beacon
  para `POST /api/videos/[id]/progress` (`lib/progress.ts` escreve
  `user_daily_stats` + `user_word_stats`). Watch time e daily chart são reais.
- **Streak/heatmap ainda só contam revisões** — dias só de imersão não contam.
  → [streak-ignores-watch-days.md]
- **Segmented range (Week/Month/Year)** é visual — os dados usam janelas fixas
  (30d retention, 7d watch, 17 semanas heatmap). Refetch por range fica para
  depois (exige client fetch ou server action).
- POS/coverage residuais do dicionário seguem em [dictionary-screen-state.md].
