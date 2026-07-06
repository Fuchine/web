# backlog: Camada 0 no worker — N+1 de dicionário e um UPDATE por linha

**Date:** 2026-07-06
**Feature:** Import (worker, camada 0)
**Status:** OPEN

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

## Esforço / prioridade

**M · alta.** Corta a latência de import em ~uma ordem de grandeza e reduz a
carga no Postgres; nenhum comportamento visível muda (mesmos tokens no fim).

## Referências

- `packages/nlp/src/analyze.ts` (`resolveWordEntries`, cache por linha)
- `packages/nlp/src/ja/dictionary.ts` (`lookup` com `SELECT *`)
- `apps/worker/src/pipeline.ts:74-95` (loop por linha + UPDATE por linha)
- Relacionado: [import-jobs-no-retry.md] (mesmo pipeline)
