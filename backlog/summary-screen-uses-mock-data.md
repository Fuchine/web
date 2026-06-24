# backlog: Summary Screen — Data Is Still Mock/Fake

**Date:** 2026-06-24
**Feature:** Session Summary (T2.x)
**Branch:** `feat/summary-screen`
**Status:** SCREEN IMPLEMENTED — DATA IS HARDCODED

---

## O que foi implementado

- **summary/page.tsx** — server component com auth gate, passa `accountName` + `accountEmail`
- **summary/summary-view.tsx** — client component fiel ao Claude Design com:

| Seção | Status |
|---|---|
| Sidebar própria (Home / Library / Review / Settings) | ✅ layout (Review ativo) |
| Avatar + nome do usuário real | ✅ (da sessão) |
| Header com selo 淵 + "Session complete" + data dinâmica | ✅ layout |
| Hero stats (Cards reviewed / Time / Retention) | ✅ layout (dados fake) |
| Grade breakdown bar + legend (Again/Hard/Good/Easy) | ✅ layout (dados fake) |
| Streak com 7 dots + checkmarks | ✅ layout (dados fake) |
| Words matured list (3 itens) | ✅ layout (dados fake) |
| Actions: "Back to home" + "Keep immersing" | ✅ rotas funcionais (`/` e `/`) |
| Animação sum-rise + prefers-reduced-motion | ✅ |

## O problema: todos os dados são mocks

### Dados hardcoded em `summary-view.tsx`

```ts
const STATS = { cards: 24, time: "8:12", retention: 88, streak: 12 };
const GRADES = [
  { label: "Again", n: 3, cls: "again" },
  { label: "Hard",  n: 5, cls: "hard" },
  { label: "Good",  n: 12, cls: "good" },
  { label: "Easy",  n: 4, cls: "easy" },
];
const WEEK = [true, true, true, true, true, true, true];
const MATURED = [
  { w: "川沿い", r: "かわぞい", g: "riverside" },
  { w: "澄んで", r: "すんで",   g: "to be clear" },
  { w: "最適",   r: "さいてき", g: "optimal" },
];
```

### Roteamento de ações

- "Back to home" → `/` (funcional)
- "Keep immersing" → `/` (placeholder — deveria ir para um vídeo real)

---

## O que falta (dados reais)

### Queries necessárias em `lib/summary.ts`

| Métrica | Fonte | Query |
|---|---|---|
| Cards reviewed | `review_logs` | `count(*) where userId = $1 AND reviewedAt > sessionStart` |
| Time spent | `review_logs.reviewedAt` | Calcular span da sessão |
| Retention | `review_logs` | Razão (grade 3 + 4) / total na sessão |
| Grade breakdown | `review_logs` | `group by grade` na sessão |
| Streak / 7-day activity | `user_daily_stats` ou `review_logs` por dia | Últimos 7 dias |
| Words matured | `sentence_cards` | Cards que passaram de `learning` → `review` state na sessão |

### Sessão de review

A Summary tela **não é um destino de navegação direta** — ela deve ser mostrada
automaticamente quando o usuário completa uma sessão de review. O fluxo esperado:

1. Usuário termina o Review (último card da fila)
2. App redireciona para `/summary?sessionId=...`
3. Server component carrega os dados daquela sessão específica
4. SummaryView exibe os resultados reais

**Isso requer:**
- Um identificador de sessão (pode ser o timestamp de início ou uma coluna `session_id` em `review_logs`)
- Persistir `session_id` nos `review_logs` durante a revisão
- Query que agrega por `session_id`

---

## Tracking

- [ ] Criar `lib/summary.ts` com queries de agregação por sessão
- [ ] Adicionar `session_id` à tabela `review_logs` (ou usar timestamp como proxy)
- [ ] ReviewSession redirecionar para `/summary` ao finalizar
- [ ] Substituir dados mock do `summary-view.tsx` por props da sessão real
- [ ] Definir rota de "Keep immersing" para um vídeo real
