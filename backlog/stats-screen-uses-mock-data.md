# backlog: Stats Screen — Data Is Still Mock/Fake

**Date:** 2026-06-24
**Feature:** Stats (T2.x)
**Branch:** `feat/stats-screen`
**Status:** SCREEN IMPLEMENTED — DATA IS HARDCODED

---

## O que foi implementado

- **stats/page.tsx** — server component com auth gate + AppLayout
- **stats/stats-view.tsx** — client component fiel ao Claude Design com:

| Seção | Status |
|---|---|
| Header + segmented range (Week/Month/Year) | ✅ layout |
| 4 KPI cards | ✅ layout (dados fake) |
| Bar chart — daily watch time | ✅ layout (dados fake) |
| Vocabulary stacked bar + legend | ✅ layout (dados fake) |
| Review consistency heatmap (17×7) | ✅ layout (PRNG determinístico) |
| Top sources by words mined | ✅ layout (dados fake) |
| Animações rise/rise-2/rise-3 | ✅ |
| Dark mode via `[data-theme="dark"]` | ✅ (herdado) |

## O problema: todos os dados são mocks

### Dados hardcoded em `stats-view.tsx`

```ts
const KPIS = [
  { k: "Words known", v: "340", d: "+18", up: true, sub: "this week" },
  { k: "Watch time", v: "12.4", u: "h", d: "+2.1h", up: true, sub: "this week" },
  { k: "Day streak", v: "12", d: "Best: 21", up: null, sub: "days" },
  { k: "Retention", v: "88", u: "%", d: "+3%", up: true, sub: "30-day avg" },
];

const ACTIVITY = [24, 38, 12, 45, 30, 52, 41]; // minutos/dia

const VOCAB = [
  { label: "Known", n: 340, cls: "known" },
  { label: "Learning", n: 86, cls: "learning" },
  { label: "New", n: 24, cls: "new" },
];

const TOP = [
  { title: "Kyoto Slow Living", words: 42, dur: "14:22" },
  { title: "ニュースで学ぶ日本語", words: 28, dur: "6:48" },
  { title: "簡単な味噌汁の作り方", words: 19, dur: "9:10" },
  { title: "VLOG：東京の電車に乗ってみた", words: 15, dur: "11:37" },
];
```

### Navegação adicionada

- `packages/ui/src/components/AppShell/nav.tsx` — Stats inserido como item ativo no sidebar entre Dictionary e Phrases; Albums adicionado como `soon`

---

## O que falta (dados reais)

### Queries necessárias em `lib/stats.ts`

| Métrica | Fonte | Query |
|---|---|---|
| Words known | `saved_words` | `count(distinct word_entry_id)` do usuário |
| Watch time | `user_daily_stats.msWatched` | `sum(ms_watched)` do período (ou fallback: duração dos vídeos com cards minerados) |
| Day streak | `review_logs.reviewedAt` + `sentence_cards.createdAt` | Dias consecutivos com atividade |
| Retention | `review_logs` | Razão (grade 3 + grade 4) / total no período |
| Daily watch time | `user_daily_stats` | Últimos 7 dias agregados por `day` |
| Vocab status | `saved_words` + `user_word_stats` | Classificar por `reviewsOk` (0=new, 1=learning, 2+=known) |
| Heatmap | `user_daily_stats.reviewsDone` | Últimas 17 semanas |
| Top sources | `sentence_cards` JOIN `videos` | `group by video_id` ordenado por count |

### Observações

- `userDailyStats` e `userWordStats` existem no schema mas **não são populados** durante uso normal do app — precisam ser alimentados por jobs ou triggers
- Alternativa: agregar direto das tabelas fonte (`sentenceCards`, `reviewLogs`, `savedWords`, `videos`) sem depender de pré-agregação — mais queries mas funciona imediatamente

---

## Tracking

- [ ] Criar `lib/stats.ts` com queries de agregação (seguir padrão de `study.ts`, `cards.ts`)
- [ ] Substituir dados mock do `stats-view.tsx` por props vindas do server component
- [ ] Decidir: popular `userDailyStats` ou agregar direto das tabelas fonte?
- [ ] Garantir que empty state funcione para novos usuários sem dados
