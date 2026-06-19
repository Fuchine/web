# backlog: Review Cloze — Duplicate Target Makes Card Show Twice

**Date:** 2026-06-19
**Feature:** Review Session (T1.7)
**Branch:** `feat/dict-popup-mining`
**Status:** PARTIALLY FIXED — DUPLICATE STILL PRESENT

---

## O que foi implementado

- `ReviewSession` (`packages/ui/src/components/Review/ReviewSession.tsx`): estado de
  pergunta com cloze `[＿＿]`, reveal, grade, e notas inline editáveis
- `ReviewCard` (`packages/ui/src/components/Review/ReviewCard.tsx`): renderização da
  frase com cloze via `splitSentence()`
- `PATCH /api/cards/[id]` (`apps/web/app/api/cards/[id]/route.ts`): salvar notas
- `getReviewQueue` em `lib/cards.ts`: agora retorna `tokens[]` e `wordEntriesMap`
  por card, populados via batch-fetch das `word_entries` do banco

## O problema: target word aparece duplicado na frase

### Sintomas

Quando a frase contém o target word **mais de uma vez**, o card cloze mostra
`[音楽]N5、N6ぐらいです。頑張り[音楽]N5、N6ぐらいです。頑張り` — a frase
inteira aparece **duas vezes**, com o target aparecendo como blank nas duas.

**Frase original:** `音楽N5、N6ぐらいです。頑張り`
**Frase tokens:** `["音楽", "N5", "、", "N6", ...]`
**Target extraído:** `音楽` (último token com wordEntryId, ou via padrão de conjugação)
**Comportamento esperado:** só a **última** ocorrência de `音楽` vira `[＿＿]`
**Comportamento real:** cloze aplicado + frase repetida

### Causa raiz

`splitSentence()` usa `lastIndexOf` para achar a última ocorrência do target
na frase e divide o texto em `before` / `blank` / `after`. Quando a frase
original contém o target 2+ vezes, `lastIndexOf` acha corretamente a posição
da última ocorrência, mas o `before` inclui **todo o texto antes** — incluindo
a **primeira** ocorrência — e o `after` inclui tudo depois.

Problema: `before` contém a primeira ocorrência intacta (não-clozeada) + resto,
e depois `blank` + `after` duplica o restante.

Exemplo com `"音楽N5、N6です。頑張り音楽"`:
- `lastIndexOf("音楽")` → posição da última (antes de 頑張り)
- `before` = `"音楽N5、N6です。頑張り"` ← inclui a primeira ocorrência
- `blank` = `"音楽"`
- `after` = `""`
- Resultado: `"[音楽]N5、N6です。頑張り" + "音楽" + ""` → aparece duplicado

### Onde o bug está

```
packages/ui/src/components/Review/ReviewCard.tsx
  └── splitSentence()
        ├── lastIndexOf(target.surface)  ← acha posição correta
        ├── text.slice(0, idx)           ← before inclui TUDO antes da última occ
        ├── target.surface                ← blank
        └── text.slice(idx + len)        ← after
```

`splitSentence` foi mudado de `indexOf` → `lastIndexOf`, e também tentou-se
`split`+`join` com regex (que substituia todas as ocorrências) — nenhum
resolveu corretamente.

### Comportamento esperado

Para cloze-deletion de frases com **palavras repetidas**:
- **Regra**: só a **última** ocorrência do target vira `[＿＿]`
- Todas as ocorrências anteriores permanecem visíveis
- A frase nunca deve ser duplicada

### Comportamento observado

| Frase | Target | Expected | Got |
|-------|--------|----------|-----|
| `音楽N5、N6です。頑張り音楽` | `音楽` | `[音楽]N5、N6です。頑張り音楽` | DUPLICADO |
| `歩いています` | `ています` | `歩い[ています]` | ✅ OK |
| `私は日本語を勉強している` | `ている` | `私は日本語を勉強し[ている]` | ✅ OK |

---

## Soluções possíveis

### 1. Usar regex replaceAll só na última ocorrência (recomendado)

Substituir a **última** ocorrência do target com regex global, deixando
as anteriores intactas:

```typescript
function splitSentence(text: string, target: TargetWord): {
  before: string;
  blank: string;
  after: string;
} {
  const escaped = target.surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped + "(?!.*" + escaped + ")");
  // Não funciona para regex simples — lookahead não segura

  // Alternativa: replaceLast manualmente
  const idx = text.lastIndexOf(target.surface);
  if (idx === -1) return { before: text, blank: "", after: "" };

  const before = text.slice(0, idx);
  const after = text.slice(idx + target.surface.length);
  // Problema: before inclui a primeira ocorrência de target

  // CORRETO: fazer replace da última ocorrência SEM split+join
  const replaced = text.slice(0, idx) + text.slice(idx + target.surface.length);
  return { before: replaced, blank: target.surface, after: "" };
  // Não — o blank tem que vir da surface original para o ruby renderizar
}
```

O problema fundamental é que `splitSentence` retorna `before`/`after` para que
o JSX monte `<>{before}<span class="blank">{blank}</span>{after}</>`. Se o
target aparece em `before`, ele vai aparecer duas vezes.

**Solução real**: `splitSentence` deveria retornar **múltiplas** partes
(`parts: {text: string, isTarget: boolean}[]`) e o JSX mapear cada uma —
só `isTarget = true` recebe o `<span class="blank">`.

### 2. Alterar splitSentence para retornar array de partes

```typescript
interface SentencePart {
  text: string;
  isTarget: boolean;
}

function splitSentence(text: string, target: TargetWord): SentencePart[] {
  const idx = text.lastIndexOf(target.surface);
  if (idx === -1) return [{ text, isTarget: false }];

  const parts: SentencePart[] = [];
  if (idx > 0) parts.push({ text: text.slice(0, idx), isTarget: false });
  parts.push({ text: target.surface, isTarget: true });
  if (idx + target.surface.length < text.length) {
    parts.push({ text: text.slice(idx + target.surface.length), isTarget: false });
  }
  return parts;
}
```

E no JSX do ReviewCard, mapear cada parte:
```tsx
{parts.map((part, i) =>
  part.isTarget
    ? <span key={i} className="blank">［ ＿＿ ］</span>
    : <span key={i}>{part.text}</span>
)}
```

**Isso garante**: target word **só aparece uma vez** (como blank), nunca duplicado.

---

## Tracking

- [ ] Implementar `splitSentence` retornando `SentencePart[]` em vez de 3 strings
- [ ] Atualizar JSX em `ReviewCard` para mapear parts com blank rendering
- [ ] Testar com frases que contêm o target 1x, 2x, 3x+
- [ ] Verificar que `extractTarget` + `splitSentence` funcionam juntos
  (padrões de conjugação + tokens + wordEntriesMap)
