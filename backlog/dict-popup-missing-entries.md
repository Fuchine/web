# backlog: Dictionary Coverage — Many Words Have No Dictionary Entry

**Date:** 2026-06-19
**Feature:** Dict Popup (T1.4) + NLP layer 0
**Branch:** `feat/dict-popup-mining`
**Status:** POPUP IMPLEMENTED — DICTIONARY COVERAGE INCOMPLETE

---

## O que foi implementado

- **DictPopup** (`packages/ui/src/components/DictPopup/`): popup que aparece ao clicar
  numa palavra tokenizada com `wordEntryId` válido
- **Player.tsx**: estado de popup + fetch em `/api/dictionary?id=`
- **PlayerFocalSubtitles**: tokens clicáveis com `onWordClick` + `onWordRef`

## O problema: maioria das palavras não tem `wordEntryId`

### Sintomas

Quando o usuário clica numa palavra tokenizada, **só aparecem clicáveis** palavras
que têm entrada no JMdict seed do banco local. Palavras comuns como「皆さん」「اهدة」
não aparecem com popup porque não existem no seed JMdict.

### Causa raiz

O seed do JMdict em `packages/db/src/seed/` populou o banco com ~60k-80k entradas.
Muitas palavras do dia-a-dia (gíria, nomes propios, expressões compostos, palavras
de contextos específicos) não estão no seed.

Resultado: `word_entries` está parcialmente populado, e o resolver de tokens
(`resolveWordEntries` em `packages/nlp/src/analyze.ts`) deixa `wordEntryId = null`
quando não encontra entrada.

### Onde o gap está

```
PlayerFocalSubtitles
  ├── tokens[].wordEntryId = null  ← não resolvido
  └── tokens[].wordEntryId = "uuid" ← tem entrada, popup funciona

cards.ts / lib/cards.ts
  └── mineSentence()  ← só funciona para linhas com tokens resolvidos

packages/nlp/src/ja/dictionary.ts
  └── JaDictionary.lookup()  ← busca no word_entries
```

### Comportamento observado

| Palavra | JMdict? | `wordEntryId` | Popup? |
|---------|----------|---------------|--------|
| 日本語 | sim | uuid | ✅ clicável |
| 歩く | sim | uuid | ✅ clicável |
| 皆さん | não | null | ❌ não clicável |
| 歩く | sim | uuid | ✅ clicável |
| を | — | null | ❌ partícula (correto) |
| です | parcialmente | null | ❌ talvez não no seed |
| 今日 | sim | uuid | ✅ clicável |

---

## Soluções possíveis

### 1. Completar o seed JMdict (recomendado)

O seed atual usa `jmdict-simplified` mas pode não ter importado todas as entradas.
Verificar se todas as entradas estão sendo importadas corretamente.

**Comando pra checar coverage:**
```sql
-- Quantas entradas no banco
SELECT count(*) FROM word_entries WHERE language = 'ja';

-- Sample aleatório
SELECT lemma, reading, pos FROM word_entries WHERE language = 'ja' ORDER BY random() LIMIT 20;
```

### 2. Buscar palavras não-resolvidas via API externa em runtime

Quando `wordEntryId` é `null`, em vez de simplesmente não mostrar popup,
fazer lookup numa API externa (Jisho.org, etc.) — mas isso adiciona latência
e depende de API externa.

### 3. Marcar palavras sem popup visualmente

Se uma palavra não tem entrada no dicionário, mostrar isso visualmente
(ícone de "?" ou cor diferente) para o usuário entender por que não clicou.

---

## Tracking

- [ ] Verificar se o seed JMdict importou todas as ~180k entradas corretamente
- [ ] Seeding completo das ~180k entradas do JMdict
- [ ] Considerar API fallback (Jisho.org) para palavras não-resolvidas
- [ ] UI feedback para palavras sem dictionary entry (opcional)
