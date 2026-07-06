# backlog: Frequency ranks não seedados — level_estimate bloqueado

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Nível do vídeo (worker) + recomendação por frequência
**Status:** RESOLVED em código (2026-07-05) — falta só rodar o seed no banco

---

## Resolução (2026-07-05)

Destravado **sem escolher nenhuma lista externa** (e sem decisão de licença):
o próprio JMdict que já seedamos carrega os tags de prioridade `nfXX` — bandas
de 500 palavras por frequência (nf01 = as 500 mais frequentes … nf48 =
23.500–24.000). É a lista "wordfreq" do Mainichi Shimbun embutida no JMdict,
sob a mesma licença EDRDG/CC-BY-SA que já usamos e atribuímos.

- `mapper.ts` (`nfRankFromTags`) deriva `frequency_rank` do menor `nfXX` de
  kanji/kana (midpoint da banda); forma sem tag → null (correto: rara).
- `index.ts`: uma lista externa (TSV) **ainda vence** quando fornecida; senão
  cai pro `nfXX`. Loga quantas rows ficaram ranqueadas.
- Testado em `mapper.test.ts` (derivação + fallback).

**Cobre** as ~24k palavras mais comuns — exatamente o que `estimateLevel` (que
ignora não-ranqueadas) e os dots de frequência precisam. Granularidade coarse
(500) mas suficiente. Para ranks mais finos/amplos no futuro, uma lista
**CC-BY-SA 4.0** (ex.: `wordfreq`, one-way compatível com GPLv3/AGPL) entra pelo
mesmo caminho, com atribuição no NOTICE — mas **não é necessária**.

### Falta (precisa do banco — não roda neste ambiente)

Re-rodar o seed (popula os ranks via `nfXX`; upsert atualiza as rows) e o
backfill de nível:
```
pnpm --filter @fuchine/db seed <jmdict-eng-*.json>
pnpm --filter @fuchine/worker backfill:level
```

## Problema (original)

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
