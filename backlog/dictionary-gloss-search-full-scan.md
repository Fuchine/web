# backlog: Busca por significado (EN) varre 298k entries com jsonb + ILIKE

**Date:** 2026-07-06
**Feature:** Dicionário (F2) — busca
**Status:** OPEN

---

## Problema

`searchByGloss` (`apps/web/lib/dictionary.ts:96-112`) implementa a busca em
inglês com:

```sql
EXISTS (
  SELECT 1 FROM jsonb_array_elements(definitions) AS s,
               jsonb_array_elements_text(s->'glosses') AS g
  WHERE g ILIKE '%term%'
)
```

sobre a tabela inteira (~298k `word_entries`). Nenhum índice cobre essa forma
(unnesting de jsonb + `ILIKE` com wildcard à esquerda): é seq scan + expansão
de jsonb linha a linha em **toda busca** — e a rota
(`app/api/dictionary/route.ts:24-29`) é chamada a cada consulta do search do
dicionário (debounce de 300ms). Centenas de ms a segundos por tecla efetiva,
piora conforme o usuário digita termos comuns.

O `ORDER BY frequency_rank asc nulls last` também é inócuo hoje (ranks não
seedados — ver [frequency-list-not-seeded.md]).

## Proposta

Mudança de schema **aditiva** (passa pelo ERD, não altera o contrato):

1. Coluna gerada/materializada `glosses_text text` em `word_entries`
   (concatenação dos glosses, preenchida no seed) + **índice GIN `pg_trgm`** —
   serve `ILIKE '%term%'` como está, sem mudar a semântica da busca.
2. Reescrever `searchByGloss` para `WHERE glosses_text ILIKE ...` (ou
   `% term %` com word boundaries, a decidir na implementação).
3. Alternativa (mais mudança, melhor ranking): `tsvector` + `websearch_to_tsquery`
   com prefix match. Recomendo começar pelo trgm — menor distância do
   comportamento atual.

## Esforço / prioridade

**M · média-alta.** O dicionário é tela primária e a busca EN é o caminho mais
lento do app hoje; o seed já reprocessa `word_entries`, então a coluna entra na
mesma passada.

## Referências

- `apps/web/lib/dictionary.ts:96-112`, `app/api/dictionary/route.ts:24-29`
- Seed: `packages/db/src/seed/` (ponto para popular `glosses_text`)
- Relacionados: [frequency-list-not-seeded.md], [dictionary-screen-state.md]
