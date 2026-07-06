# backlog: CI roda só os testes do web — worker e llm ficam de fora

**Date:** 2026-07-06
**Feature:** DX / CI
**Status:** OPEN

---

## Problema

O job de CI (`.github/workflows/ci.yml:31-32`) executa apenas
`pnpm --filter @fuchine/web exec vitest run`. Ficam **fora do CI**:

- `apps/worker` — `level.test.ts`, `provider.test.ts` (estimativa de nível,
  resolução do provider house);
- `packages/llm` — `openai-compatible.test.ts` (o contrato de alinhamento 1:1
  do CONTRATO §3.2!), `fallback.test.ts`, `prewarm.test.ts`;
- qualquer teste futuro em `core`/`nlp`/`ui`.

Uma regressão na garantia mais importante do contrato de IA (alinhamento 1:1)
passaria verde no CI hoje. O typecheck cobre todos os pacotes, mas os testes
não.

## Proposta

Trocar o step por `pnpm -r --if-present exec vitest run` (ou definir a task
`test` no `turbo.json` com cache e rodar `pnpm turbo test`). Custo de CI:
segundos.

## Esforço / prioridade

**S · alta.** Uma linha de YAML; elimina uma classe inteira de regressão
silenciosa nos pacotes que guardam os contratos do produto.

## Referências

- `.github/workflows/ci.yml:31-32`
- Testes hoje invisíveis: `apps/worker/src/*.test.ts`,
  `packages/llm/src/**/*.test.ts`
- Relacionado: [core-paths-missing-tests.md]
