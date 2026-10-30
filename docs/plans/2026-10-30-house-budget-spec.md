# House-key spend ceiling (T2.4)

**Date:** 2026-10-30
**Roadmap:** T2.4 in `docs/ROADMAP_ENGENHARIA.md` (Fase 2, Bloco B)
**Closes:** A2 in `backlog/ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md` (with T2.3)
**Status:** Implemented

## Problem

The operator's LLM key (the "house" key) pays for three things: layer-1 chunk
translation in the player, layer-2 explanations for users without their own
key, and the background pre-warm of explanations. Rate limits exist, but only
**per user** (120 explains/h, 500 chunks/day), so total spend grows with the
number of accounts. T2.3 bounds the number of accounts; T2.4 bounds the money.

## Design

### Two knobs

| Env | Default | Effect |
|---|---|---|
| `HOUSE_DAILY_TOKEN_BUDGET` | unset = unlimited | Ceiling on tokens (input + output) spent with the house key per instance-local day, across web and worker. |
| `HOUSE_EXPLAIN_FALLBACK` | `true` | `false` = a user without a BYOK key cannot generate *new* explanations on the house key; cached ones still serve. Pre-warm and translation are unaffected. |

The day is the process-local day (`TZ`), the same boundary as streaks and daily
stats. Invalid values fail the production boot (web) and the worker start.

### Accounting

`llm_usage` gains `key_source` (`'house' | 'byok'`, default `'house'`) and an
index on `(key_source, created_at)` (migration 0017). Calls are marked through
the existing optional `meta` (`UsageMeta.keySource`, CONTRATO_IA §5.2 update):
the explain path marks BYOK calls `byok`; everything else defaults to `house`,
so an unmarked call counts against the budget rather than escaping it.

Spend today = `sum(coalesce(in_tokens,0) + coalesce(out_tokens,0))` over house
rows since local midnight. Each process caches the figure for 30 s, so the
check is one indexed query per half-minute, not per request. The ceiling is
therefore soft by up to ~30 s of traffic, which is acceptable for a cost guard.

DeepL (`MT_PROVIDER=deepl`) reports characters, not tokens, so it is not
counted; it is bounded by the DeepL plan's own quota. The LLM fallback behind
DeepL is counted.

### Enforcement points

| Path | When over budget | Cache hit |
|---|---|---|
| `POST /api/lines/:id/explain` (house provider only) | 429 `{ code: "house_budget" }` | still 200 |
| `POST /api/videos/:id/translate` (miss) | 429 `{ code: "house_budget" }` | still 200 |
| Worker explain pre-warm | job stops before the next line, summary logs `stopped: budget` | — |
| `POST /api/lines/:id/explain`, no BYOK, `HOUSE_EXPLAIN_FALLBACK=false` | 403 `{ code: "byok_required" }` | still 200 |

BYOK explanations are never limited by the house budget.

The player shows the server's message for these codes instead of the generic
"Could not generate an explanation right now", so the user sees *why* and what
to do ("Add your own API key in Settings…").

### Operator visibility

- `GET /api/health` adds `houseBudget: "unlimited" | "ok" | "exhausted"` (no
  numbers: the endpoint is public).
- `pnpm --filter @fuchine/worker usage` prints today's house tokens against the
  budget, split by function, plus BYOK tokens for reference.
- Production boot warns when a real house provider is configured with no budget.

## Done when

- [x] Over budget: explain (house), translate miss and pre-warm stop; cache hits
      keep returning 200 (E2E).
- [x] BYOK explains are unaffected by the budget (E2E).
- [x] `HOUSE_EXPLAIN_FALLBACK=false`: a user without a key gets `byok_required`
      and the player tells them to add a key; cached explanations still serve.
- [x] Health reports the budget state; the usage CLI prints the numbers.
- [x] `.env.example`, README, DEPLOY_CHECKLIST, CONTRATO_IA, CLAUDE.md updated.
