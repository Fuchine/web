# backlog: Explain dá 500 para provider BYOK não implementado ou chave não-decifrável

**Date:** 2026-07-10
**Feature:** IA / Explain (BYOK)
**Status:** CLOSED (2026-07-10) — M1: `ALLOWED_PROVIDERS` restrito a `["minimax", "openai"]`; M2: catch ampliado em `lib/explain.ts` — qualquer erro de construção/decifragem do provider cai para `houseProvider()` com log de diagnóstico. Era M1/M2 de [CORRECOES-PRE-DEPLOY-2026-07-10.md].

---

## Problema

Dois caminhos quebram a regra "falha de IA degrada, não quebra" no
`POST /api/lines/[id]/explain`:

1. **Provider aceito mas não construível (M1).** `ALLOWED_PROVIDERS`
   (`apps/web/lib/settings.ts:10`) aceita `anthropic`, `gemini`, `local` e
   `openai-compatible`, mas `createProvider`
   (`packages/llm/src/providers/index.ts:52-96`) lança para todos eles:
   `anthropic`/`gemini` são "not implemented", `local` nem existe em
   `ProviderName` (cai no default "Unknown provider") e `openai-compatible`
   exige `baseUrl`+`model` que `resolveUserProvider` nunca recebe das settings.
2. **Chave BYOK não-decifrável (M2).** Se `FUCHINE_ENCRYPTION_KEY` for
   rotacionada/alterada, `decryptApiKey` lança (auth tag do GCM;
   `packages/llm/src/crypto.ts:52-55`) — e `loadKey` também lança com a env
   malformada. Sem vazamento (mensagem do GCM é genérica), mas quebra.

Nos dois casos o erro não é `MissingApiKeyError`, então o catch de
`lib/explain.ts:71-79` relança e a rota não tem try/catch → **500**. Cenário:
o usuário salva `llmProvider: "anthropic"` + uma chave via `PATCH
/api/settings` (aceito sem erro) → todo cache-miss do explain quebra. 4 dos 6
valores aceitos pelo PATCH produzem esse estado. Escopo: só o explain — a
tradução usa o MT house e não passa por `resolveUserProvider`.

## Proposta

As duas metades — só o fallback esconderia do usuário que a config BYOK dele
está quebrada, gastando a house key em silêncio:

1. **Restringir `ALLOWED_PROVIDERS` a `["minimax", "openai"]`** (os
   implementados de fato) — impede estado inválido novo. Reintroduzir os
   demais quando `createProvider` os suportar.
2. **Ampliar o catch em `lib/explain.ts`**: qualquer falha de
   construção/decifragem do provider (não só `MissingApiKeyError`) cai para
   `houseProvider()`, logando `userId` + tipo do erro (nunca a chave) para
   diagnóstico de rotação. Cobre linhas antigas no banco (usuários que já
   salvaram um provider hoje inválido) e fecha o M2 junto.

## Esforço / prioridade

**S · alta (bloqueia deploy).** Um PR pequeno fecha M1+M2; teste unitário do
fallback em `lib/explain` sem Redis/LLM (provider injetável já existe).

## Referências

- `apps/web/lib/settings.ts:10` (`ALLOWED_PROVIDERS`)
- `apps/web/lib/explain.ts:71-79` (catch estreito)
- `packages/llm/src/providers/index.ts:52-96` (`createProvider` lança)
- `packages/llm/src/resolve.ts:34` + `packages/llm/src/crypto.ts:41-56`
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (M1, M2)
