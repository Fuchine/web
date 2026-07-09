# backlog: Caminhos críticos sem testes — cards (FSRS), explain, import

**Date:** 2026-07-06
**Feature:** Qualidade / testes
**Status:** PARTIAL (reassessed 2026-07-09). The **pure** sub-parts now have
tests: `import.test.ts` covers `validateImportRequest` (URL/caps/truncation),
`cards.test.ts` covers `buildReviewQueuePayload`. Still **untested** — the
db-orchestrating critical paths the item is really about: `reviewCardById`
(grade→FSRS→log write, D6) and `explainLine` (cache-hit-skips-provider,
BYOK→house fallback, `force`, ProviderError→502). Those need a fake-db harness
or a small seam refactor (the repo's tests target pure functions and don't mock
Drizzle) — a deliberate effort, not a drive-by. Item 4 (E2E mine→queue→review→log)
also still open.

---

## Problema

Os libs de `apps/web` seguem o padrão "lógica testável em lib/" — mas
justamente os três caminhos mais críticos não têm arquivo de teste:

- **`lib/cards.ts`** — mineração (dedup por índice único), fila de revisão e
  `reviewCardById` (grade → FSRS → log). É o coração do loop do produto e a
  única escrita no histórico FSRS (D6). Zero testes.
- **`lib/explain.ts`** — cache-first + resolução BYOK→house + `force`. O
  caminho que gasta dinheiro. Zero testes.
- **`lib/import.ts`** — validação, dedup/cache compartilhado, enfileiramento
  (coberto só indiretamente pelo E2E, que não roda em PR).

Em contraste, translate, progress, albums, settings, stats, summary e
dictionary têm testes unitários. E2E cobre albums/progress/comprehension; nada
cobre a revisão de ponta a ponta.

## Proposta

Testes unitários no padrão dos vizinhos (provider/db injetáveis):

1. `cards.test.ts`: grade inválido → 400; review reagenda **e** grava log
   coerente; dedup de mineração devolve o card existente com `created: false`.
2. `explain.test.ts`: cache hit **não** chama provider; BYOK ausente cai para
   house; `force` regenera; `ProviderError` → 502.
3. `import.test.ts`: URL inválida, sem captions → 422, dedup retorna existente,
   captions viram linhas ordenadas.
4. Estender o E2E com um fluxo mine → queue → review → log.

## Esforço / prioridade

**M · média-alta.** É onde um bug custa dados (histórico FSRS) ou dinheiro
(explain); os moldes de teste já existem no diretório.

## Referências

- `apps/web/lib/cards.ts`, `lib/explain.ts`, `lib/import.ts` (sem `.test.ts`)
- Padrão: `apps/web/lib/translate.test.ts`, `lib/progress.test.ts`
- Relacionados: [ci-package-tests-missing.md],
  [review-flow-not-transactional.md]
