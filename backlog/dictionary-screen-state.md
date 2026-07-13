# Dictionary Screen — estado atual

## Implementado (funcionando)
- Browse: paginação por `LENGTH(lemma)` (palavras simples primeiro), cursor `l:<length>:<id>`, scroll infinito, eager fill-viewport
- POS filter chips (Verb / Adjective / Adverb / Noun / Grammar / Expression) na browse — envia JMdict POS tags via `string_to_array` + `&&`
- Search com debounce de 300ms
- Collection tab: palavras salvas carregadas via `GET /api/dictionary/collection`
- Detail panel: status selector, "See in context", fonte dos cards
- Coverage bar: distribuição de todos os itens, totalCount, percentual
- Manual status override via `statusMap` local
- Toast de confirmação ao mudar status

## Problemas conhecidos

### 1. Status override não é persistente — ✅ CORRIGIDO (2026-07-05)
~~O `statusMap` era `useState` local e sumia no reload.~~ Adicionada a coluna
`saved_words.status` (enum `word_status`, nullable = usa o status derivado de
mastery), migration `0008`. Novo `PATCH /api/dictionary/[id]/saved` com
`{status}` (`setWordStatus` faz upsert — marcar status salva a palavra).
`GET /api/dictionary/saved` devolve `statuses` e a view hidrata o `statusMap`;
`/collection` aplica o override (`r.override ?? computeStatus(m)`).

### 2. Grammar tab nunca retorna resultados — ✅ CORRIGIDO (antes de 2026-07-05)
~~O endpoint filtrava por nomes em inglês (`"Particle"`, `"Auxiliary"`…) que nunca batiam com as tags JMdict reais.~~ O código atual usa `grammarPosCondition` (`lib/dictionary-utils.ts`), que compara `string_to_array(pos, ',')` contra tags JMdict reais (`GRAMMAR_POS = aux, aux-adj, aux-v, conj, cop, prt, pref, suf, ctr`). Como `word_entries.pos` é gravado como CSV dessas tags (`seed/mapper.ts`: `pos.join(",")`), a query agora casa. O mesmo `grammarPosCondition` alimenta o `grammar=true` da browse. **Verificar em runtime com o banco seedado** (não coberto por teste com DB aqui).

### 3. Grammar tab ignora o POS filter da browse — parcialmente obsoleto
Browse e grammar hoje compartilham `grammarPosCondition`, então o filtro "Grammar" da browse e o endpoint de grammar usam a mesma lógica de POS. O que resta é conceitual: o endpoint `/api/dictionary/grammar` opera sobre a **coleção salva** do usuário (`saved_words`), enquanto os chips da browse filtram o dicionário inteiro — são superfícies diferentes de propósito, não um bug.

### 4. POS filter incompleto (Browse)
Os chips de POS filter da browse têm 6 categorias (Verb, Adjective, Adverb, Noun, Grammar, Expression) — cada uma mapeada a um conjunto de JMdict POS tags. Mas a gramática completa do JMdict (136+ tags) cobre muitos outros POS que não estão representados (ex.: pronomes, advérbios interrogativos, prefixos, sufixos, numerais, etc.). Foi um recorte para a UI.

### 5. `totalCount` na browse é o total de word_entries (~298k)
Útil para a coverage bar, mas é uma contagem crua do banco. Não reflete filtro POS nem busca. É o total absoluto.

### 6. Sem métrica de cobertura real
A coverage bar mostra distribuição dos itens atuais + percentual sobre totalCount, mas não há métrica de "cobertura funcional" (ex.: % de palavras mais frequentes cobertas, % de POS cobertos, etc.).

### 7. (2026-07-06, auditoria) Escala de frequência divergente entre popup e dicionário — ✅ CORRIGIDO (2026-07-10)
~~O popup do player calcula o tier com `ceil(frequencyRank / 6000)` clampado 1–5
(`packages/ui/src/components/Player/Player.tsx:738`), enquanto a tela do
dicionário usa `freqTier` com cortes 1500/5000/15000/30000
(`apps/web/lib/dictionary.ts:26-33`). A mesma palavra mostra quantidades
diferentes de dots nos dois lugares (ex.: rank 4000 → 4 dots no dicionário,
1 no popup).~~ `freqTier` agora vive em `@fuchine/core/freq.ts` e é importado
tanto pelo Player quanto pelo dicionário. Os cortes 1500/5000/15000/30000
são a única fonte de verdade, mesma palavra = mesmos dots em todo lugar.

### 8. (2026-07-06, auditoria) Busca EN é full scan — ✅ CORRIGIDO
~~A busca por significado varria a tabela inteira com jsonb + ILIKE.~~ A coluna
materializada `word_entries.glosses_text` (blob de todas as glosses por entrada)
tem um índice GIN `pg_trgm` (`word_entries_glosses_trgm_idx`, migration `0013`).
`searchByGloss` (`lib/dictionary.ts`) faz `ILIKE '%term%'` sobre `glosses_text`
— mesma semântica, mas sondagem de índice em vez de seq scan de ~298k linhas por
tecla. O seed popula `glosses_text` no insert e no conflict (`seed/index.ts`);
a migration 0013 ainda backfilla as linhas existentes, então funciona sem
re-seed.
