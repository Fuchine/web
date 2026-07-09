# backlog: Camada 0 no worker — N+1 de dicionário e um UPDATE por linha

**Date:** 2026-07-06
**Feature:** Import (worker, camada 0)
**Status:** PARTIAL (itens 1 e 3 feitos em 2026-07-07; item 2 adiado)

---

## Problema

O enriquecimento da camada 0 processa linha a linha com round trips demais:

1. **Cache de lookup só vale dentro da linha.** `resolveWordEntries`
   (`packages/nlp/src/analyze.ts:24`) cria o `Map` de cache **por linha**;
   `analyzeLine` é chamada por linha (`apps/worker/src/pipeline.ts:79`). Uma
   palavra comum (は, する, 私…) repetida em 400 linhas dispara 400 lookups
   idênticos no Postgres.
2. **Cada lookup é `SELECT *`.** `JaDictionary.lookup`
   (`packages/nlp/src/ja/dictionary.ts:16-27`) traz a linha inteira de
   `word_entries` — incluindo o jsonb `definitions` — quando o resolver só usa
   `id` e `reading`.
3. **Um UPDATE por linha.** `pipeline.ts:80` grava os tokens de cada linha em
   um UPDATE individual: vídeo de 600 linhas = 600 statements sequenciais.

Impacto: um import de vídeo típico (~400–600 linhas) faz **milhares de round
trips** ao Postgres. Com `concurrency: 2` no worker, dois imports simultâneos
dobram a pressão. É o principal gargalo de latência do pipeline hoje (a
tokenização kuromoji em si é local e rápida).

## Proposta

Sem tocar nas interfaces `Tokenizer`/`DictionaryProvider` (D4):

1. **Cache por vídeo:** aceitar um cache externo em `resolveWordEntries` (ou um
   `DictionaryProvider` memoizado) criado uma vez por import e compartilhado
   entre as linhas.
2. **Lookup em lote:** primeiro tokenizar todas as linhas (local), coletar os
   lemmas únicos do vídeo, resolver em 1–2 queries (`WHERE lemma = ANY(...) OR
   reading = ANY(...)`) selecionando só `id, lemma, reading, frequencyRank`, e
   então preencher `wordEntryId` em memória.
3. **UPDATE em lote:** gravar os tokens com um único statement
   (`UPDATE ... FROM unnest(...)`) ou ao menos dentro de uma transação com
   chunks de ~100.

## Resolução parcial (2026-07-07)

**Item 1 (feito) — cache por vídeo.** `resolveWordEntries(tokens, dictionary,
cache?)` aceita um `Map` compartilhado (default: cache fresco por chamada,
preserva o comportamento standalone); `analyzeLine(..., cache?)` repassa. O
`pipeline.ts` cria **um** cache por import e passa a todas as linhas — um lemma
comum (は, する, 私…) é resolvido 1× no vídeo inteiro em vez de 1×/ocorrência.
Isso mata o N+1 do item 1 (o gargalo descrito). Testado em
`apps/worker/src/resolve-cache.test.ts` (+3): lookup único de lemma repetido
entre linhas, resolução do `wordEntryId`, e default por-chamada preservado.

**Item 3 (feito) — write em lote.** A análise (tokenização + lookups) roda toda
**antes** do write, fora de transação; depois os tokens de todas as linhas +
o insert de `word_examples` são gravados num único `db.transaction` (em vez de um
UPDATE autocommit por linha). Atomicidade + uma conexão.

**Item 2 (adiado) — query única `WHERE lemma = ANY(...)`.** Exigiria um método de
lookup em lote no `DictionaryProvider`, e o item pede explicitamente **não tocar
nas interfaces `Tokenizer`/`DictionaryProvider` (D4)**. Com o cache do item 1, os
lookups já caem de "por ocorrência" para "por lemma único"; o batch em 1–2
queries é o próximo passo quando/se valer estender a interface (método opcional).
O `UPDATE ... FROM unnest(...)` de statement único também fica aqui — precisa de
verificação com Postgres ao vivo (binding de `jsonb[]`), que não temos neste
ambiente; a transação do item 3 é o "ao menos" que a própria proposta previa.

`pnpm typecheck` (8/8) + `pnpm test` (17 worker) verdes. O import de ponta a ponta
depende de banco (E2E, não rodado aqui).

## Esforço / prioridade

**M · alta.** Corta a latência de import em ~uma ordem de grandeza e reduz a
carga no Postgres; nenhum comportamento visível muda (mesmos tokens no fim).

## Referências

- `packages/nlp/src/analyze.ts` (`resolveWordEntries`, cache por linha)
- `packages/nlp/src/ja/dictionary.ts` (`lookup` com `SELECT *`)
- `apps/worker/src/pipeline.ts:74-95` (loop por linha + UPDATE por linha)
- Relacionado: [import-jobs-no-retry.md] (mesmo pipeline)
