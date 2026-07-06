# backlog: Review aplica FSRS em 6 round trips sem transação

**Date:** 2026-07-06
**Feature:** Review / SRS (F1, T1.7)
**Status:** OPEN

---

## Problema

`reviewCardById` (`apps/web/lib/cards.ts:121-168`) executa, em sequência e
**fora de transação**: select do card → UPDATE do estado FSRS → INSERT do
`review_logs` → upsert de `user_daily_stats` → select dos tokens da linha →
upsert de `user_word_stats`.

Uma falha no meio (deploy, crash, timeout de pool) deixa estado inconsistente:
card reagendado **sem log** — e o log completo é a base declarada para
re-otimizar parâmetros FSRS por usuário no futuro (D6); ou log gravado sem os
contadores de stats. Também são 6 round trips no endpoint mais quente da sessão
de revisão.

`mineSentence` (linhas 22-64) tem o mesmo padrão em menor grau (INSERT do card
+ bump de stats separados).

## Proposta

1. Envolver update + insert log + bumps em `db.transaction(...)`.
2. Cortar round trips: buscar os `tokens` da linha no mesmo select inicial do
   card (join com `subtitle_lines`), eliminando o select posterior.
3. Mesmo tratamento em `mineSentence` (transação card + daily stats).

## Esforço / prioridade

**S · média.** Poucas linhas, protege o dado mais valioso do produto (histórico
FSRS íntegro) e tira latência do loop de revisão.

## Referências

- `apps/web/lib/cards.ts:121-168` (`reviewCardById`), `:22-64` (`mineSentence`)
- `docs/ARQUITETURA.md` D6 (logs completos p/ re-otimização)
- Relacionado: [core-paths-missing-tests.md] (mesmo arquivo sem testes)
