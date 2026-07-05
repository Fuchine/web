# backlog: Frequency ranks não seedados — level_estimate bloqueado

**Date:** 2026-07-04
**Feature:** Nível do vídeo (worker) + recomendação por frequência
**Status:** OPEN — bloqueado em decisão de dados (escolha da lista + licença)

---

## Problema

O `seed:jmdict` do banco de dev rodou **sem** a lista de frequência opcional:
~298k `word_entries` com `frequency_rank` NULL (só 2 linhas de fixture têm).

Consequência: `videos.level_estimate` fica null — o pipeline está pronto e
testado (`apps/worker/src/level.ts`, mediana do rank das palavras distintas,
mínimo 20 ranqueadas; gravado no fim do import; `backfill:level` para vídeos
antigos), mas `backfill:level` corretamente reporta 0/N sem os ranks.
Também afeta o índice `word_entries_freq_idx` ("recommendation by frequency").

## O que precisa

1. **Escolher uma lista de frequência JP** com licença compatível com AGPL
   (candidatas a avaliar: BCCWJ short-unit, listas derivadas de Wikipedia/CC,
   JPDB/Netflix lists — checar cada licença antes).
2. Converter para o formato do seed: TSV `termo<TAB>rank` (ou
   `termo<TAB>leitura<TAB>rank`), ver `packages/db/src/seed/frequency.ts`.
3. Rodar:
   ```
   pnpm --filter @fuchine/db seed:jmdict <frequency.tsv>
   pnpm --filter @fuchine/worker backfill:level
   ```

## Referências

- Seed: `packages/db/src/seed/index.ts` (`rankFor`), `frequency.ts` (formato)
- Estimador: `apps/worker/src/level.ts` (+ `level.test.ts`)
- Memória da sessão: ranks nulos detectados 2026-07-04
