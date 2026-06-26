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

### 1. Status override não é persistente
O `statusMap` é `useState` local — muda a badge e o detail na hora, mas some ao recarregar a página. Não tem endpoint de PATCH nem coluna no schema (`saved_words` não tem `status`).

### 2. Grammar tab nunca retorna resultados
O endpoint `GET /api/dictionary/grammar` filtra por `inArray(wordEntries.pos, GRAMMAR_POS)` com valores `"Particle"`, `"Auxiliary"`, `"Conjunction"`, etc. — nomes em inglês. A coluna `wordEntries.pos` armazena tags JMdict reais (`"v5r"`, `"n"`, `"adj-i"`, `"prt"`, etc.), que nunca batem com esses nomes. A query sempre retorna 0 linhas.

### 3. Grammar tab ignora o POS filter da browse
Mesmo que o grammar endpoint fosse corrigido, ele tem seu próprio conjunto fixo de POS (`GRAMMAR_POS`) que não se alinha com os chips de POS filter da browse (Verb/Adjective/Adverb/Noun/Grammar/Expression). As duas features operam com lógicas diferentes.

### 4. POS filter incompleto (Browse)
Os chips de POS filter da browse têm 6 categorias (Verb, Adjective, Adverb, Noun, Grammar, Expression) — cada uma mapeada a um conjunto de JMdict POS tags. Mas a gramática completa do JMdict (136+ tags) cobre muitos outros POS que não estão representados (ex.: pronomes, advérbios interrogativos, prefixos, sufixos, numerais, etc.). Foi um recorte para a UI.

### 5. `totalCount` na browse é o total de word_entries (~298k)
Útil para a coverage bar, mas é uma contagem crua do banco. Não reflete filtro POS nem busca. É o total absoluto.

### 6. Sem métrica de cobertura real
A coverage bar mostra distribuição dos itens atuais + percentual sobre totalCount, mas não há métrica de "cobertura funcional" (ex.: % de palavras mais frequentes cobertas, % de POS cobertos, etc.).
