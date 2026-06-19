# Explain Panel Implementation Plan

> **For agentic workers:** Implement task-by-task, in order. Each task is TDD where a test is given; otherwise typecheck/build is the gate. Steps use checkbox (`- [ ]`) syntax. Commit after each task. **Do not** reorder tasks — later tasks depend on earlier ones.

**Goal:** Build the player's **Explain panel** — a right-rail tab that shows an AI line explanation (a per-part grammar/vocab breakdown + an "in plain terms" prose), matching the design mockup.

**Architecture:** Enrich the layer-2 `Explanation` contract to `{ breakdown, plainTerms }` (bump `prompt_version` 1→2). Make the existing `POST /api/lines/[id]/explain` usable by falling back to the house LLM key when the user has no BYOK key, and add a `force` (regenerate) path. Add a presentational `PlayerExplain` component and wire it into the player's right rail as a second tab.

**Tech Stack:** Next.js 15 App Router (React 19), Drizzle (Postgres), `@fuchine/llm` (OpenAI-compatible provider, e.g. MiniMax), Vitest, Tailwind v4 + class-scoped CSS.

**Spec:** `docs/plans/2026-06-18-explain-panel-spec.md`

---

## Operating context (read first — assume zero repo knowledge)

- **Monorepo:** pnpm + Turborepo. Packages: `@fuchine/core` (domain), `@fuchine/db` (Drizzle schema + jsonb types), `@fuchine/llm` (AI layer), `@fuchine/ui` (React design system), `@fuchine/nlp`, apps `@fuchine/web` (Next.js) and `@fuchine/worker`.
- **Shell:** Windows. A **Bash tool** is available and all commands below are POSIX/pnpm; run them from the repo root `C:\dev\fuchine\web` (do not prefix with `cd`). Postgres + Redis run via `docker-compose.yml` (container `web-postgres-1`, user `fuchine`, db `fuchine`, on localhost:5432). The repo-root `.env` already has `DATABASE_URL` and `LLM_PROVIDER=minimax` + a working `LLM_API_KEY` (MiniMax: base `https://api.minimax.io/v1`, model `minimax-m3`).
- **Commands:**
  - Typecheck one package: `pnpm --filter <name> typecheck` (e.g. `@fuchine/llm`, `@fuchine/web`, `@fuchine/ui`, `@fuchine/db`). All: `pnpm typecheck`.
  - Web tests (Vitest): `pnpm --filter @fuchine/web test`. Single file: `pnpm --filter @fuchine/web exec vitest run lib/<file>.test.ts`. `@fuchine/llm` has its own Vitest too: `pnpm --filter @fuchine/llm test` (single: `pnpm --filter @fuchine/llm exec vitest run src/<path>.test.ts`).
  - Dev server: `pnpm --filter @fuchine/web dev` (port 3000/3001). Storybook for UI: check `packages/ui` scripts.
- **Patterns to mirror:** `apps/web/lib/translate.ts` (the analogous "fetch-and-cache" lib that was just added), `apps/web/lib/explain.ts` (existing layer-2 flow), and the just-merged lazy-translation player wiring in `packages/ui/src/components/Player/Player.tsx` (state + injected async callback `onFetchChunk`). The Explain wiring follows the same shape (`onFetchExplanation`).
- **Degrade, don't break:** AI failure must never crash the player — show an error state, keep the rest working.
- **Theme tokens** (CSS vars) available and used by `apps/web/app/videos/[id]/player.css`: `--text`, `--text-muted`, `--text-faint`, `--surface`, `--bg`, `--bg-2`, `--border`, `--border-strong`, `--link`, `--accent`, `--accent-soft`, `--accent-soft-2`, `--accent-line`, `--on-accent`. Use ONLY these (do not introduce `--radius`/`--shadow-sm`/`--field-bg-2`/`--ease` from the mockup CSS — substitute literals as shown in Task 4).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `packages/db/src/types.ts` | `Explanation`/`ExplanationPart`/`PartTag` (v2 shape) | Modify |
| `packages/llm/src/contract.ts` | `PROMPT_VERSION = 2`, re-exports | Modify |
| `packages/llm/src/prompts.ts` | `buildExplainMessages` for v2 shape | Modify |
| `packages/llm/src/providers/openai-compatible.ts` | `coerceExplanation` v2 | Modify |
| `packages/llm/src/providers/openai-compatible.test.ts` | unit test for coerce v2 | Create |
| `packages/llm/src/cache.ts` | `force` (upsert) path in `explainLineCached`/`saveExplanation` | Modify |
| `apps/web/lib/house-provider.ts` | shared `houseProvider()` | Create |
| `apps/web/lib/translate.ts` | import `houseProvider` from new module | Modify |
| `apps/web/lib/explain.ts` | house-key fallback + `force` | Modify |
| `apps/web/app/api/lines/[id]/explain/route.ts` | accept `{ force }` | Modify |
| `docs/CONTRATO_IA.md` | §4 v2 + house fallback note | Modify |
| `packages/ui/src/components/Player/PlayerExplain.tsx` | the panel (presentational) | Create |
| `packages/ui/src/components/Player/PlayerExplain.stories.tsx` | story | Create |
| `packages/ui/src/components/Player/PlayerTranscript.tsx` | drop outer `<aside>`+tabs (body only) | Modify |
| `packages/ui/src/components/Player/Player.tsx` | rail tabs + explain state/fetch + focal Explain button plumbing | Modify |
| `packages/ui/src/index.ts` | export `PlayerExplain` if barrel lists components | Modify |
| `apps/web/app/videos/[id]/player.css` | `.ex-*` + tab/state styles | Modify |
| `apps/web/app/videos/[id]/player-view.tsx` | implement `onFetchExplanation` | Modify |

---

## Task 1: Enriched `Explanation` contract (v2) + prompt + coerce

This task changes the layer-2 output shape everywhere it's defined/produced. It must be done as one unit so the `@fuchine/llm` package typechecks. **No DB migration** — `ai_explanations.content` is `jsonb` typed `$type<Explanation>()`; the type change is compile-time only, and the cache is keyed by `prompt_version` so old v1 rows are harmless orphans.

**Files:** Modify `packages/db/src/types.ts`, `packages/llm/src/contract.ts`, `packages/llm/src/prompts.ts`, `packages/llm/src/providers/openai-compatible.ts`. Create `packages/llm/src/providers/openai-compatible.test.ts`.

- [ ] **Step 1 — `packages/db/src/types.ts`:** replace the `JlptLevel`, `GrammarPoint`, and `Explanation` definitions (lines 3 and 15–27) with:

```ts
// Coarse part-of-speech / role tag for a breakdown item (drives the UI chip).
export type PartTag =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "particle"
  | "grammar"
  | "expression";

// One part of an explanation breakdown (a span of the sentence).
export type ExplanationPart = {
  surface: string; // the span in Japanese; may cover several tokens (歩いて います)
  tag: PartTag; // coarse category for the UI chip
  gloss: string; // short label in explanation_language ("every morning")
  note: string; // one-sentence explanation in explanation_language
  accent?: boolean; // the single most important part to highlight
};

// Output of explainLine (prompt_version 2). Stored in ai_explanations.content.
export type Explanation = {
  breakdown: ExplanationPart[]; // ordered walk of the sentence's salient parts (cap 8)
  plainTerms: string; // "in plain terms" prose, in explanation_language
};
```

(Leave `Token`, `Definition`, `DailyGoals` unchanged. `JlptLevel`/`GrammarPoint` are removed — they were only used by the old `Explanation` and by the coerce code updated below. The `Field`/`TextField.stories.tsx` grep match for "summary" is unrelated — do not touch it.)

- [ ] **Step 2 — `packages/llm/src/contract.ts`:** update the type re-exports and bump the version. Change line 8 from:

```ts
export type { GrammarPoint, JlptLevel } from "@fuchine/db";
```
to:
```ts
export type { ExplanationPart, PartTag } from "@fuchine/db";
```

And change `export const PROMPT_VERSION = 1;` to:
```ts
/** prompt_version 2: breakdown + plainTerms shape (was summary/grammarPoints/nuance). */
export const PROMPT_VERSION = 2;
```

- [ ] **Step 3 — `packages/llm/src/prompts.ts`:** replace the entire `buildExplainMessages` function (currently lines ~61–98) with a version that requests the v2 shape:

```ts
/** explainLine (layer 2): a line in context -> the v2 Explanation object. */
export function buildExplainMessages(
  ctx: SubtitleLineCtx,
  explanationLanguage: string,
): ChatMessage[] {
  const lang = languageName(explanationLanguage);
  const system =
    `You explain ${languageName(ctx.learningLanguage)} sentences for a learner, ` +
    `writing in ${lang}. Return ONLY a JSON object with this exact shape:\n` +
    `{\n` +
    `  "breakdown": [            // ordered, at most 8 salient parts of the sentence\n` +
    `    { "surface": string,    // the span in Japanese (may cover several tokens, e.g. 歩いて います)\n` +
    `      "tag": "noun"|"verb"|"adjective"|"adverb"|"particle"|"grammar"|"expression",\n` +
    `      "gloss": string,      // a short label in ${lang} (e.g. "every morning")\n` +
    `      "note": string,       // ONE sentence explaining this part, in ${lang}\n` +
    `      "accent": boolean }   // true for THE single most important part, else omit/false\n` +
    `  ],\n` +
    `  "plainTerms": string      // 1-3 sentences, in ${lang}, explaining what the whole line means and why it reads naturally\n` +
    `}\n` +
    `Walk the sentence left to right. Merge trivial tokens; skip pure punctuation. ` +
    `Prioritize what a learner likely does not know. Do NOT include romaji (readings ` +
    `already come from tokens). If the line is untranslatable noise, return an empty ` +
    `breakdown [] and say so in plainTerms.`;

  const tokenHint = ctx.tokens
    .map((t) => `${t.surface}(${t.reading || "?"}/${t.pos})`)
    .join(" ");

  const user = JSON.stringify({
    line: ctx.text,
    previousLine: ctx.prevText,
    nextLine: ctx.nextText,
    tokens: tokenHint,
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

(Leave `buildTranslateMessages`/`buildTranslateOneMessages`/`languageName`/`ChatMessage` unchanged.)

- [ ] **Step 4 — `packages/llm/src/providers/openai-compatible.ts`:** update the explanation coercion.

  (a) Change the import on line 5 from:
  ```ts
  import type { Explanation, JlptLevel, LlmProvider, SubtitleLineCtx } from "../contract";
  ```
  to:
  ```ts
  import type { Explanation, ExplanationPart, PartTag, LlmProvider, SubtitleLineCtx } from "../contract";
  ```

  (b) Replace the constants block (lines ~28–30) — remove `JLPT_LEVELS` and `MAX_GRAMMAR_POINTS`, add the tag set and a breakdown cap:
  ```ts
  const TRANSLATE_CHUNK = 40;
  const PART_TAGS: readonly string[] = [
    "noun", "verb", "adjective", "adverb", "particle", "grammar", "expression",
  ];
  const MAX_BREAKDOWN_PARTS = 8;
  ```

  (c) Remove the `coerceLevel` helper (lines ~196–200).

  (d) Replace `coerceExplanation` (lines ~202–224) with:
  ```ts
  function coerceTag(value: unknown): PartTag {
    return typeof value === "string" && PART_TAGS.includes(value)
      ? (value as PartTag)
      : "expression";
  }

  /** Coerce an arbitrary parsed object into a valid v2 Explanation. */
  export function coerceExplanation(raw: unknown): Explanation {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const parts = Array.isArray(obj.breakdown) ? obj.breakdown : [];
    const breakdown: ExplanationPart[] = parts
      .slice(0, MAX_BREAKDOWN_PARTS)
      .map((p): ExplanationPart => {
        const g = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
        return {
          surface: asString(g.surface),
          tag: coerceTag(g.tag),
          gloss: asString(g.gloss),
          note: asString(g.note),
          accent: g.accent === true,
        };
      })
      .filter((p) => p.surface.length > 0);

    return { breakdown, plainTerms: asString(obj.plainTerms) };
  }
  ```

  (`asString`, `extractJson`, and the `explainLine` method that calls `coerceExplanation(extractJson(content))` stay as-is.)

- [ ] **Step 5 — write the coerce unit test.** Create `packages/llm/src/providers/openai-compatible.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { coerceExplanation } from "./openai-compatible";

describe("coerceExplanation (v2)", () => {
  it("keeps a well-formed breakdown + plainTerms", () => {
    const out = coerceExplanation({
      breakdown: [
        { surface: "毎朝", tag: "adverb", gloss: "every morning", note: "sets the time." },
        { surface: "歩いて います", tag: "grammar", gloss: "~ている", note: "ongoing action.", accent: true },
      ],
      plainTerms: "Says they walk every morning.",
    });
    expect(out.breakdown).toHaveLength(2);
    expect(out.breakdown[1]).toMatchObject({ tag: "grammar", accent: true });
    expect(out.plainTerms).toBe("Says they walk every morning.");
  });

  it("coerces an unknown tag to 'expression' and drops empty-surface parts", () => {
    const out = coerceExplanation({
      breakdown: [
        { surface: "を", tag: "bogus", gloss: "obj", note: "x" },
        { surface: "", tag: "noun", gloss: "", note: "" },
      ],
      plainTerms: "",
    });
    expect(out.breakdown).toHaveLength(1);
    expect(out.breakdown[0]!.tag).toBe("expression");
  });

  it("caps the breakdown at 8 parts", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      surface: `t${i}`, tag: "noun", gloss: "g", note: "n",
    }));
    expect(coerceExplanation({ breakdown: parts, plainTerms: "" }).breakdown).toHaveLength(8);
  });

  it("returns empty breakdown + empty plainTerms for garbage", () => {
    const out = coerceExplanation("not json");
    expect(out.breakdown).toEqual([]);
    expect(out.plainTerms).toBe("");
  });
});
```

- [ ] **Step 6 — verify.**
  - `pnpm --filter @fuchine/llm exec vitest run src/providers/openai-compatible.test.ts` → PASS (4 tests).
  - `pnpm --filter @fuchine/llm typecheck` → clean.
  - `pnpm typecheck` → all packages clean. **If `@fuchine/db` or any other package fails**, it means a leftover reference to `GrammarPoint`/`JlptLevel`/`summary`/`grammarPoints`/`nuance` — search and fix (e.g. `git grep -nE "GrammarPoint|JlptLevel|grammarPoints"`); none should remain outside this task's edits.

- [ ] **Step 7 — commit.**
```bash
git add packages/db/src/types.ts packages/llm/src/contract.ts packages/llm/src/prompts.ts packages/llm/src/providers/openai-compatible.ts packages/llm/src/providers/openai-compatible.test.ts
git commit -m "feat(llm): enrich Explanation contract to v2 (breakdown + plainTerms)"
```

---

## Task 2: Make explain usable — house-key fallback + regenerate (force)

The endpoint currently 422s on a cache miss when the user has no BYOK key, and there's no Settings UI. Add a house-key fallback (BYOK still wins when present) and a `force` regenerate path.

**Files:** Create `apps/web/lib/house-provider.ts`. Modify `apps/web/lib/translate.ts`, `packages/llm/src/cache.ts`, `apps/web/lib/explain.ts`, `apps/web/app/api/lines/[id]/explain/route.ts`.

- [ ] **Step 1 — extract the house provider.** Create `apps/web/lib/house-provider.ts`:

```ts
// The self-host "house" LLM provider, built from env (same vars as the worker).
// Used for layer-1 translation and as the layer-2 fallback when a user has no
// BYOK key. Returns the "echo" provider when nothing is configured (which means
// translation yields null and explanation throws — degrade, don't break).

import { createProvider, type LlmProvider, type ProviderName } from "@fuchine/llm";

export function houseProvider(): LlmProvider {
  return createProvider({
    provider: (process.env.LLM_PROVIDER ?? "echo") as ProviderName,
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    model: process.env.LLM_MODEL || undefined,
  });
}
```

- [ ] **Step 2 — point `translate.ts` at it.** In `apps/web/lib/translate.ts`, DELETE the local `houseProvider` function (the `export function houseProvider() { ... }` block) and its now-unused imports, and instead import it. At the top, replace the `createProvider` import usage: remove `createProvider`/`ProviderName` from the `@fuchine/llm` import if they become unused (keep `LlmProvider`), and add:
```ts
import { houseProvider } from "./house-provider";
```
Verify `translate.ts` still references `houseProvider()` (it does, in `translateChunk`). Run `pnpm --filter @fuchine/web typecheck` after to confirm no unused-import errors.

- [ ] **Step 3 — add a `force` (upsert) path to the cache.** In `packages/llm/src/cache.ts`:

  (a) Change `saveExplanation` to upsert instead of ignore-on-conflict. Replace its body's `.onConflictDoNothing();` call with an explicit upsert keyed on the cache unique index:
  ```ts
  export async function saveExplanation(
    db: Database,
    key: CacheKey,
    content: Explanation,
    model: string | null,
  ): Promise<void> {
    await db
      .insert(aiExplanations)
      .values({
        subtitleLineId: key.subtitleLineId,
        kind: key.kind,
        explanationLanguage: key.explanationLanguage,
        promptVersion: key.promptVersion,
        model,
        content,
      })
      .onConflictDoUpdate({
        target: [
          aiExplanations.subtitleLineId,
          aiExplanations.kind,
          aiExplanations.explanationLanguage,
          aiExplanations.promptVersion,
        ],
        set: { content, model },
      });
  }
  ```

  (b) Add a `force` option to `explainLineCached` so regenerate skips the cache read:
  ```ts
  export async function explainLineCached(
    db: Database,
    provider: LlmProvider,
    subtitleLineId: string,
    ctx: SubtitleLineCtx,
    opts: { explanationLanguage: string; kind?: ExplanationKind; model?: string; force?: boolean },
  ): Promise<Explanation> {
    const key: CacheKey = {
      subtitleLineId,
      kind: opts.kind ?? "line",
      explanationLanguage: opts.explanationLanguage,
      promptVersion: PROMPT_VERSION,
    };

    if (!opts.force) {
      const cached = await getCachedExplanation(db, key);
      if (cached) return cached;
    }

    const fresh = await provider.explainLine(ctx, {
      explanationLanguage: opts.explanationLanguage,
    });
    await saveExplanation(db, key, fresh, opts.model ?? null);
    return fresh;
  }
  ```

- [ ] **Step 4 — `apps/web/lib/explain.ts`: house fallback + force.**

  (a) Add the import at the top (next to the existing imports):
  ```ts
  import { houseProvider } from "./house-provider";
  ```

  (b) Change the function signature to accept `force`:
  ```ts
  export async function explainLine(
    db: Database,
    userId: string,
    lineId: string,
    opts: { encryptionKey?: string; force?: boolean },
  ): Promise<Result> {
  ```

  (c) When `force` is set, SKIP the early cache-hit return. Find the cache-first block:
  ```ts
    const cached = await getCachedExplanation(db, key);
    if (cached) return { status: 200, body: { explanation: cached, cached: true } };
  ```
  and guard it:
  ```ts
    if (!opts.force) {
      const cached = await getCachedExplanation(db, key);
      if (cached) return { status: 200, body: { explanation: cached, cached: true } };
    }
  ```

  (d) Replace the provider resolution (the `try { provider = await resolveUserProvider(...) } catch ...` block) so a missing BYOK key falls back to the house provider instead of 422-ing:
  ```ts
    // BYOK wins when configured; otherwise fall back to the house key (self-host).
    let provider;
    try {
      provider = await resolveUserProvider(db, userId, opts.encryptionKey ?? "");
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        provider = houseProvider();
      } else {
        throw err;
      }
    }
  ```
  Note: this removes the previous `if (!opts.encryptionKey) return 500` guard — `resolveUserProvider` will throw `MissingApiKeyError` (no provider/key configured) which now falls back to house. Keep the `ProviderError → 502` handling around `explainLineCached` as-is.

  (e) Pass `force` into `explainLineCached`:
  ```ts
    const explanation = await explainLineCached(db, provider, lineId, ctx, {
      explanationLanguage,
      force: opts.force,
    });
  ```

- [ ] **Step 5 — route accepts `force`.** Replace `apps/web/app/api/lines/[id]/explain/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { explainLine } from "@/lib/explain";

// POST /api/lines/:id/explain — layer-2 explanation (cache-first; force=regenerate).
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { force?: unknown };
  const result = await explainLine(db, session.user.id, id, {
    encryptionKey: process.env.FUCHINE_ENCRYPTION_KEY,
    force: body.force === true,
  });
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 6 — verify.**
  - `pnpm --filter @fuchine/llm typecheck` and `pnpm --filter @fuchine/web typecheck` → clean.
  - Integration (real MiniMax; requires a subtitle line id — get one with:
    `docker compose exec -T postgres psql -U fuchine -d fuchine -c "SELECT id FROM subtitle_lines LIMIT 1;"`):
    ```bash
    pnpm --filter @fuchine/web exec tsx -e "import('dotenv').then(d=>d.config({path:'../../.env'})).then(()=>import('./lib/db')).then(async ({db})=>{const {explainLine}=await import('./lib/explain');console.log(JSON.stringify(await explainLine(db,'00000000-0000-0000-0000-000000000000','<LINE_ID>',{encryptionKey:process.env.FUCHINE_ENCRYPTION_KEY}),null,1));process.exit(0)})"
    ```
    Expected: `status 200`, body `{ explanation: { breakdown:[…], plainTerms:"…" }, cached:false }`; a second run → `cached:true`; passing `{...,force:true}` regenerates (`cached:false`). Confirm a row with `prompt_version=2`:
    `docker compose exec -T postgres psql -U fuchine -d fuchine -c "SELECT prompt_version, kind FROM ai_explanations;"`

- [ ] **Step 7 — commit.**
```bash
git add apps/web/lib/house-provider.ts apps/web/lib/translate.ts packages/llm/src/cache.ts apps/web/lib/explain.ts apps/web/app/api/lines/[id]/explain/route.ts
git commit -m "feat(web): explain house-key fallback + regenerate (force)"
```

---

## Task 3: Update the AI contract doc

**File:** Modify `docs/CONTRATO_IA.md`.

- [ ] **Step 1** — In section `## 4. explainLine`, update the `### 4.2. Saída` shape to the v2 object and add a note. Replace the TypeScript block under 4.2 (the `type Explanation = { summary; grammarPoints; nuance }` + `type GrammarPoint` block) with:

````markdown
```ts
type Explanation = {
  breakdown: ExplanationPart[]; // percurso ordenado das partes salientes (teto 8)
  plainTerms: string;           // prosa "in plain terms", em explanation_language
};

type ExplanationPart = {
  surface: string;  // trecho em japonês; pode abranger vários tokens (歩いて います)
  tag: "noun" | "verb" | "adjective" | "adverb" | "particle" | "grammar" | "expression";
  gloss: string;    // rótulo curto em explanation_language
  note: string;     // uma frase de explicação em explanation_language
  accent?: boolean; // a parte mais importante, destacada
};
```

> **Atualização 2026-06-18 — `prompt_version = 2`.** O shape mudou de
> `{ summary, grammarPoints, nuance }` para `{ breakdown, plainTerms }` (mais rico,
> casa com o painel Explain). Entradas v1 no cache ficam órfãs e inofensivas (§5.3).
> **Provider:** o cache-miss usa a chave BYOK do usuário quando configurada; sem
> ela, cai para a *house key* (env `LLM_*`) — pequeno desvio do §6.2, justificado
> enquanto não há tela de Settings. **Regenerate:** `POST /api/lines/[id]/explain`
> com `{ force: true }` ignora e sobrescreve o cache.
````

(If the surrounding prose in §4.3/§4.4 still mentions `summary`/`grammarPoints`/`nuance` by name, leave it — it's historical; the v2 note above governs. Do not rewrite the whole section.)

- [ ] **Step 2 — commit.**
```bash
git add docs/CONTRATO_IA.md
git commit -m "docs(contrato): explainLine v2 (breakdown + plainTerms)"
```

---

## Task 4: `PlayerExplain` component (presentational) + styles + story

A pure presentational component: given the focal line + an `Explanation` (or loading/error), render the panel. No data fetching here.

**Files:** Create `packages/ui/src/components/Player/PlayerExplain.tsx`, `packages/ui/src/components/Player/PlayerExplain.stories.tsx`. Modify `apps/web/app/videos/[id]/player.css`, `packages/ui/src/index.ts`.

- [ ] **Step 1 — create `packages/ui/src/components/Player/PlayerExplain.tsx`:**

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { Explanation } from "@fuchine/db";

const TAG_LABEL: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adjective: "Adj",
  adverb: "Adverb",
  particle: "Particle",
  grammar: "Grammar",
  expression: "Expression",
};

export type ExplainFocal = {
  textOriginal: string;
  textTranslation: string | null;
  /** Optional token surface to highlight inside the sentence. */
  focusSurface?: string | null;
};

export interface PlayerExplainProps {
  focal: ExplainFocal | null;
  explanation: Explanation | null;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
  /** Inert for now (no notes store yet); button is shown disabled. */
  onSaveNote?: () => void;
  className?: string;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" fill="currentColor" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

/** Render the JA sentence, highlighting the focus token if present. */
function renderSentence(text: string, focus?: string | null): ReactNode {
  if (!focus || !text.includes(focus)) return text;
  const i = text.indexOf(focus);
  return (
    <>
      {text.slice(0, i)}
      <span className="ex-hl">{focus}</span>
      {text.slice(i + focus.length)}
    </>
  );
}

export function PlayerExplain({
  focal,
  explanation,
  loading,
  error,
  onRegenerate,
  onSaveNote,
  className,
}: PlayerExplainProps): ReactNode {
  return (
    <div className={cn("explain", className)}>
      <div className="ex-scroll">
        {focal ? (
          <div className="ex-sentence">
            <div className="ex-ja jp">{renderSentence(focal.textOriginal, focal.focusSurface)}</div>
            {focal.textTranslation && <div className="ex-en">{focal.textTranslation}</div>}
          </div>
        ) : (
          <div className="ex-state">Select a line to explain it.</div>
        )}

        {focal && loading && <div className="ex-state">Generating explanation…</div>}

        {focal && error && !loading && (
          <div className="ex-state ex-error">
            <span>{error}</span>
            <button type="button" className="ex-retry" onClick={onRegenerate}>Try again</button>
          </div>
        )}

        {focal && explanation && !loading && (
          <>
            <div className="ex-meta">
              <SparkIcon />
              <span>Generated breakdown</span>
              <span className="ex-dot" />
              Grammar
            </div>

            {explanation.breakdown.length > 0 && (
              <ul className="ex-parts">
                {explanation.breakdown.map((p, i) => (
                  <li key={i} className={cn("ex-part", p.accent && "accent")}>
                    <div className="ex-part-head">
                      <span className="ex-tok jp">{p.surface}</span>
                      <span className="ex-chip">{TAG_LABEL[p.tag] ?? p.tag}</span>
                      {p.gloss && <span className="ex-gloss">{p.gloss}</span>}
                    </div>
                    {p.note && <p className="ex-note">{p.note}</p>}
                  </li>
                ))}
              </ul>
            )}

            {explanation.plainTerms && (
              <div className="ex-prose">
                <div className="ex-prose-label">In plain terms</div>
                <p>{explanation.plainTerms}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ex-foot">
        <button type="button" className="ex-fbtn" onClick={onRegenerate} disabled={!focal || loading}>
          <RefreshIcon /> Regenerate
        </button>
        <button
          type="button"
          className="ex-fbtn primary"
          onClick={onSaveNote}
          disabled
          title="Coming soon"
        >
          <BookmarkIcon /> Save note
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 — append the styles to `apps/web/app/videos/[id]/player.css`** (at the end of the file). These are ported from the mockup, scoped under `.player-page`, with mockup-only tokens replaced by approved tokens/literals:

```css
/* ---- Explain panel ---- */
.player-page .explain { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.player-page .ex-scroll { flex: 1; overflow-y: auto; padding: 18px 20px 22px; }

.player-page .ex-sentence {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 15px 16px;
  box-shadow: 0 1px 2px rgba(33,30,26,0.04);
}
.player-page .ex-ja {
  font-family: 'Inter', 'Noto Sans JP', sans-serif;
  font-size: 20px; font-weight: 500; line-height: 1.6; color: var(--text); letter-spacing: 0.01em;
}
.player-page .ex-ja .ex-hl { background: var(--accent-soft-2); color: var(--link); border-radius: 5px; padding: 0 3px; }
.player-page .ex-en { font-size: 13.5px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }

.player-page .ex-meta {
  display: flex; align-items: center; gap: 8px; margin: 18px 2px 12px;
  font-size: 11.5px; font-weight: 550; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-faint);
}
.player-page .ex-meta svg { color: var(--link); }
.player-page .ex-meta .ex-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--border-strong); }

.player-page .ex-parts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.player-page .ex-part { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: var(--bg-2); }
.player-page .ex-part.accent { border-color: var(--accent-line); background: var(--accent-soft); }
.player-page .ex-part-head { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
.player-page .ex-tok { font-family: 'Inter', 'Noto Sans JP', sans-serif; font-size: 16px; font-weight: 600; color: var(--text); }
.player-page .ex-chip {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--text-muted); background: var(--bg-2);
  border: 1px solid var(--border); border-radius: 5px; padding: 2px 6px;
}
.player-page .ex-part.accent .ex-chip { color: var(--link); background: var(--surface); border-color: var(--accent-line); }
.player-page .ex-gloss { font-size: 13px; color: var(--text-muted); }
.player-page .ex-note { margin: 8px 0 0; font-size: 13px; line-height: 1.55; color: var(--text); }

.player-page .ex-prose { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.player-page .ex-prose-label { font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 8px; }
.player-page .ex-prose p { margin: 0; font-size: 13.5px; line-height: 1.65; color: var(--text); text-wrap: pretty; }

.player-page .ex-state { padding: 20px 2px; font-size: 13.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px; }
.player-page .ex-state.ex-error { color: var(--text); }
.player-page .ex-retry {
  align-self: flex-start; height: 32px; padding: 0 12px;
  border: 1px solid var(--border-strong); background: var(--surface); border-radius: 8px;
  font: inherit; font-size: 12.5px; font-weight: 550; color: var(--text); cursor: pointer;
}
.player-page .ex-retry:hover { border-color: var(--text-faint); }

.player-page .ex-foot { flex: none; display: flex; gap: 8px; padding: 13px 16px; border-top: 1px solid var(--border); background: var(--bg-2); }
.player-page .ex-fbtn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 38px;
  border: 1px solid var(--border-strong); background: var(--surface); border-radius: 9px;
  font: inherit; font-size: 13px; font-weight: 550; color: var(--text); cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.player-page .ex-fbtn:hover:not(:disabled) { border-color: var(--text-faint); }
.player-page .ex-fbtn:disabled { opacity: 0.5; cursor: default; }
.player-page .ex-fbtn.primary { color: var(--link); background: var(--accent-soft-2); border-color: var(--accent-line); }
```

- [ ] **Step 3 — story.** Create `packages/ui/src/components/Player/PlayerExplain.stories.tsx` mirroring the existing `PlayerTranscript.stories.tsx` format (open that file first to match the exact `Meta`/`StoryObj` style and any decorators). Provide three stories: `Loaded` (a focal line + an explanation with 3 breakdown parts incl. one `accent`), `Loading` (`loading: true`), and `ErrorState` (`error: "could not generate…"`). Use inline mock data of type `Explanation` from `@fuchine/db`.

- [ ] **Step 4 — export.** Open `packages/ui/src/index.ts`. If it exports the other Player pieces (e.g. `PlayerTranscript`, types), add an export for `PlayerExplain` and `PlayerExplainProps`/`ExplainFocal` following the existing pattern. (If the barrel only exports the top-level `Player`, skip — Player will import PlayerExplain directly.)

- [ ] **Step 5 — verify.** `pnpm --filter @fuchine/ui typecheck` → clean. If Storybook is set up, the stories render without errors.

- [ ] **Step 6 — commit.**
```bash
git add packages/ui/src/components/Player/PlayerExplain.tsx packages/ui/src/components/Player/PlayerExplain.stories.tsx packages/ui/src/index.ts apps/web/app/videos/[id]/player.css
git commit -m "feat(ui): add PlayerExplain panel component"
```

---

## Task 5: Wire the Explain panel into the player

Turn the single-tab rail into Transcript/Explain tabs, fetch the explanation for the focal line on demand, and add a focal "Explain" entry button.

**Files:** Modify `packages/ui/src/components/Player/PlayerTranscript.tsx`, `packages/ui/src/components/Player/PlayerFocalSubtitles.tsx`, `packages/ui/src/components/Player/Player.tsx`, `apps/web/app/videos/[id]/player-view.tsx`.

- [ ] **Step 1 — make `PlayerTranscript` tab-bar-less.** In `packages/ui/src/components/Player/PlayerTranscript.tsx`, the component currently renders `<aside className="rail">` containing a `.rail-tabs` block (single hardcoded Transcript tab) then `.tr-sub` + `.tr-list`. Remove the outer `<aside>` wrapper AND the `.rail-tabs` block, returning a fragment of just `.tr-sub` + `.tr-list`. Concretely, the return becomes:

```tsx
  return (
    <>
      <div className="tr-sub">
        <div className="tr-tools">
          {/* …existing furigana + translation toggle buttons, unchanged… */}
        </div>
      </div>
      <div className="tr-list" ref={railRef}>
        {/* …existing lines.map(...) unchanged… */}
      </div>
    </>
  );
```

Keep all props and the `lines.map` body exactly as they are. Remove the now-unused `SearchIcon` only if it was used solely in the deleted tab bar (check; if unused after, delete it to keep typecheck/lint clean).

- [ ] **Step 2 — add an `onExplain` affordance to the focal subtitles.** In `packages/ui/src/components/Player/PlayerFocalSubtitles.tsx`, add an optional prop and a small actions row under the translation. Add to `PlayerFocalSubtitlesProps`:
```ts
  onExplain?: () => void;
```
And just before the closing `</div>` of `.focal-subs`, add:
```tsx
      {onExplain && (
        <div className="focal-actions">
          <button type="button" className="focal-btn" onClick={onExplain}>Explain</button>
        </div>
      )}
```
Destructure `onExplain` in the component signature. Then add styles to `apps/web/app/videos/[id]/player.css`:
```css
.player-page .focal-actions { margin-top: 14px; display: flex; justify-content: center; }
.player-page .focal-btn {
  height: 34px; padding: 0 16px; border: 1px solid var(--border-strong);
  background: var(--surface); border-radius: 9px; font: inherit; font-size: 13px;
  font-weight: 550; color: var(--text); cursor: pointer;
}
.player-page .focal-btn:hover { border-color: var(--text-faint); }
```

- [ ] **Step 3 — `Player.tsx`: tabs, explain state, fetch, render.** Make these edits in `packages/ui/src/components/Player/Player.tsx`:

  (a) Add imports: at the top, import the new component and the Explanation type:
  ```ts
  import { PlayerExplain, type ExplainFocal } from "./PlayerExplain";
  import type { Explanation } from "@fuchine/db";
  ```

  (b) Add two optional props to `PlayerProps`:
  ```ts
    /** Fetch (and cache) the layer-2 explanation for a line. force = regenerate. */
    onFetchExplanation?: (lineId: string, opts?: { force?: boolean }) => Promise<Explanation>;
  ```

  (c) Destructure `onFetchExplanation` in the component signature (alongside `onFetchChunk` etc.).

  (d) Add state near the other `useState`s:
  ```ts
    const [activeRailTab, setActiveRailTab] = useState<"transcript" | "explain">("transcript");
    const [explanations, setExplanations] = useState<Map<string, Explanation>>(() => new Map());
    const [explainLoading, setExplainLoading] = useState(false);
    const [explainError, setExplainError] = useState<string | null>(null);
  ```

  (e) Add a fetch helper + an effect. The focal line is `currentLine` (already computed near the bottom as `lines[currentLineIdx]`); compute it earlier or reference `currentLineIdx`. Add:
  ```ts
    const fetchExplanation = useCallback(
      async (lineId: string, force = false) => {
        if (!onFetchExplanation) return;
        setExplainLoading(true);
        setExplainError(null);
        try {
          const ex = await onFetchExplanation(lineId, { force });
          setExplanations((prev) => new Map(prev).set(lineId, ex));
        } catch {
          setExplainError("Could not generate an explanation right now.");
        } finally {
          setExplainLoading(false);
        }
      },
      [onFetchExplanation],
    );

    // When the Explain tab is open, ensure the focal line is explained.
    useEffect(() => {
      if (activeRailTab !== "explain" || currentLineIdx < 0) return;
      const line = lines[currentLineIdx] as PlayerSubtitleLine | undefined;
      if (!line || explanations.has(line.id) || explainLoading) return;
      void fetchExplanation(line.id);
    }, [activeRailTab, currentLineIdx, lines, explanations, explainLoading, fetchExplanation]);
  ```

  (f) An `onExplain` handler for the focal button + the rail tab switch: define
  ```ts
    const openExplain = useCallback(() => setActiveRailTab("explain"), []);
  ```

  (g) Pass `onExplain={openExplain}` to `<PlayerStage>` → it must forward to `PlayerFocalSubtitles`. In `PlayerStage.tsx`, add an optional `onExplain?: () => void` prop and forward it to `<PlayerFocalSubtitles ... onExplain={onExplain} />`. Then in `Player.tsx` pass `onExplain={openExplain}` into the `<PlayerStage .../>` element.

  (h) Replace the rail rendering. Currently the body renders `<PlayerTranscript ... />` directly inside `.player-body`. Wrap it in the rail aside with tabs and switch panels. Replace the `<PlayerTranscript ... />` element (and nothing else) with:
  ```tsx
            <aside className="rail" aria-label="Study panel">
              <div className="rail-tabs">
                <button
                  type="button"
                  className={cn("rail-tab", activeRailTab === "transcript" && "on")}
                  aria-current={activeRailTab === "transcript" ? "page" : undefined}
                  onClick={() => setActiveRailTab("transcript")}
                >
                  Transcript
                </button>
                <button
                  type="button"
                  className={cn("rail-tab", activeRailTab === "explain" && "on")}
                  aria-current={activeRailTab === "explain" ? "page" : undefined}
                  onClick={() => setActiveRailTab("explain")}
                >
                  Explain
                </button>
              </div>
              {activeRailTab === "transcript" ? (
                <PlayerTranscript
                  lines={transcriptLines}
                  currentLineIdx={currentLineIdx}
                  showTranslation={showTranslation}
                  showFurigana={showFurigana}
                  onLineClick={seekToLine}
                  onToggleTranslation={() => setShowTranslation((v) => !v)}
                  onToggleFurigana={() => setShowFurigana((v) => !v)}
                  formatTimecode={fmt}
                  railRef={railRef}
                  lineRefs={lineRefs}
                />
              ) : (
                <PlayerExplain
                  focal={focal ? toExplainFocal(focal) : null}
                  explanation={currentLine ? explanations.get(currentLine.id) ?? null : null}
                  loading={explainLoading}
                  error={explainError}
                  onRegenerate={() => currentLine && void fetchExplanation(currentLine.id, true)}
                />
              )}
            </aside>
  ```
  Note `currentLine` and `focal` are computed just above the `return` already; ensure they're in scope where the rail renders (they are — they're defined before `return`). Add a tiny adapter near the other helpers at top-of-file:
  ```ts
  function toExplainFocal(focal: FocalLine): ExplainFocal {
    return { textOriginal: focal.textOriginal, textTranslation: focal.textTranslation, focusSurface: null };
  }
  ```
  (`FocalLine` is already imported.) Confirm `cn` is already imported in Player.tsx (it is).

- [ ] **Step 4 — `player-view.tsx`: implement `onFetchExplanation`.** In `apps/web/app/videos/[id]/player-view.tsx`, add a second `useCallback` and pass it through. Update the `Omit` to also omit `onFetchExplanation`, and add:
```tsx
  const onFetchExplanation = useCallback(
    async (lineId: string, opts?: { force?: boolean }) => {
      const res = await fetch(`/api/lines/${lineId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: opts?.force === true }),
      });
      if (!res.ok) throw new Error(`explain failed: ${res.status}`);
      const data = (await res.json()) as { explanation: import("@fuchine/db").Explanation };
      return data.explanation;
    },
    [],
  );
```
and pass `onFetchExplanation={onFetchExplanation}` to `<Player>`. Update the props type to `Omit<PlayerProps, "onBack" | "onNavigate" | "onFetchChunk" | "onFetchExplanation">`.

- [ ] **Step 5 — verify.**
  - `pnpm --filter @fuchine/ui typecheck && pnpm --filter @fuchine/web typecheck` → clean.
  - **Manual (browser):** `pnpm --filter @fuchine/web dev`, sign in, open `/videos/<id>`. Click the **Explain** tab (or the focal **Explain** button) → "Generating…" then a breakdown + "In plain terms" appear for the current line. As the video advances to a new line and the Explain tab is open, it fetches that line. **Regenerate** swaps the content. **Save note** is visible but disabled. Confirm rows land:
    `docker compose exec -T postgres psql -U fuchine -d fuchine -c "SELECT prompt_version, count(*) FROM ai_explanations GROUP BY 1;"`

- [ ] **Step 6 — commit.**
```bash
git add packages/ui/src/components/Player/PlayerTranscript.tsx packages/ui/src/components/Player/PlayerFocalSubtitles.tsx packages/ui/src/components/Player/PlayerStage.tsx packages/ui/src/components/Player/Player.tsx apps/web/app/videos/[id]/player-view.tsx apps/web/app/videos/[id]/player.css
git commit -m "feat(player): wire Explain panel into the right rail"
```

---

## Final verification

- [ ] `pnpm typecheck` (all packages) — PASS
- [ ] `pnpm --filter @fuchine/web test` and `pnpm --filter @fuchine/llm test` — PASS
- [ ] Manual browser round-trip (Task 5 Step 5): Explain tab → breakdown + plain terms render; Regenerate works; errors degrade (set `LLM_PROVIDER=echo` in `.env` and confirm the panel shows the error state instead of crashing, then restore `minimax`).

## Notes for the implementer
- **Do not** add a Settings/BYOK screen, a notes table, "Mine sentence", or the word dictionary popup — all explicitly out of scope (see spec §5).
- Keep each commit green (`pnpm typecheck`). Task 1 must be committed as a whole (the type change cascades through `@fuchine/llm`).
- Mirror existing conventions: `{ status, body }` lib results, injected async callbacks for network (like `onFetchChunk`), class-scoped CSS under `.player-page`, theme tokens only.
