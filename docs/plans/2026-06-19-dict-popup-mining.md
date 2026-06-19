# Dictionary Popup + Sentence Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clickable-token dictionary popup (`DictPopup`) and a mine-to-review confirmation toast (`MinedCard`) to the immersion player, wired to real dictionary and cards APIs.

**Architecture:** Two presentational components in `@fuchine/ui` (Storybook-validated, the repo's component-first convention). Pure display-mapping logic lives in `apps/web/lib` (vitest-tested). The player owns interaction state and fetch callbacks; `PlayerStage` hosts the anchored popup + overlay. A new `DELETE /api/cards` backs Undo.

**Tech Stack:** Next 15 App Router, React 19, TypeScript, Tailwind v4 + hand-rolled `player.css`, Drizzle, vitest, Storybook. Design source: `claude-design/player.jsx` + `claude-design/player.css`.

**Conventions:** `packages/ui` has NO unit tests — components are validated in Storybook. `apps/web/lib/*.test.ts` are pure-function vitest tests (no test DB). DB operations are verified live. Follow these; do not add unit tests to `packages/ui` or a test-DB harness.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/ui/src/components/Player/DictPopup.tsx` (create) | Presentational dictionary popup + `DictEntry`/`PopupAnchor` types |
| `packages/ui/src/components/Player/DictPopup.stories.tsx` (create) | Storybook stories |
| `packages/ui/src/components/Player/MinedCard.tsx` (create) | Presentational mine confirmation + `MinedCardProps` |
| `packages/ui/src/components/Player/MinedCard.stories.tsx` (create) | Storybook stories |
| `packages/ui/src/index.ts` (modify) | Export the two components + their types |
| `packages/ui/src/components/Player/PlayerFocalSubtitles.tsx` (modify) | Clickable tokens, active highlight, token refs, Mine button |
| `packages/ui/src/components/Player/PlayerStage.tsx` (modify) | Host anchored `DictPopup` + `MinedCard`; stage ref + anchoring |
| `packages/ui/src/components/Player/Player.tsx` (modify) | Popup/mined state, dict fetch cache, pass-through callbacks |
| `apps/web/lib/dictionary.ts` (modify) | `freqBucket`, `posLabel`, `toDictEntry` pure mappers |
| `apps/web/lib/dictionary.test.ts` (create) | Vitest tests for the mappers |
| `apps/web/lib/cards.ts` (modify) | `deleteCard` |
| `apps/web/app/api/cards/route.ts` (modify) | `DELETE` handler |
| `apps/web/app/videos/[id]/player-view.tsx` (modify) | Wire `onFetchDictionary`, `onMineSentence`, `onUndoMine`, `onViewDeck` |
| `apps/web/app/videos/[id]/player.css` (modify) | Port popup/mined/token CSS from the design |

---

## Task 1: DictPopup component + types + stories

**Files:**
- Create: `packages/ui/src/components/Player/DictPopup.tsx`
- Create: `packages/ui/src/components/Player/DictPopup.stories.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Anchor geometry computed from the clicked token's rect (see PlayerStage). */
export interface PopupAnchor {
  left: number;
  bottom: number;
  arrowLeft: number;
  width: number;
}

/** Display-ready popup data — combined from a token + its dictionary entry. */
export interface DictEntry {
  surface: string;                  // inflected form, e.g. 歩いて
  surfaceReading: string | null;    // e.g. あるいて
  posLabel: string;                 // friendly label, e.g. "Verb · te-form"
  freqBucket: number;               // 0–5 (0 = unknown)
  freqLabel: string;                // e.g. "Very common" ("" when unknown)
  dictionaryForm: { lemma: string; reading: string | null } | null; // 歩く / あるく
  glosses: string[];                // ["to walk", "to go on foot"]
}

export interface DictPopupProps {
  entry: DictEntry;
  pos: PopupAnchor | null;
  saved: boolean;
  onExplain: () => void;
  onClose: () => void;
  /** Omit to render Save word disabled (no saved-words table yet). */
  onSave?: () => void;
  className?: string;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" fill="currentColor" />
    </svg>
  );
}
function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true" width="15" height="15">
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function DictPopup({ entry, pos, saved, onExplain, onClose, onSave, className }: DictPopupProps): ReactNode {
  if (!pos) return null;
  return (
    <>
      <div className="scrim-soft" onClick={onClose} aria-hidden="true" />
      <div
        className={cn("dict-pop", className)}
        style={{ left: pos.left, bottom: pos.bottom, width: pos.width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Dictionary: ${entry.surface}`}
      >
        <div className="dict-arrow" style={{ left: pos.arrowLeft - 6 }} />

        <div className="dp-head">
          <div>
            <div className="dp-word jp">{entry.surface}</div>
            {entry.surfaceReading && <div className="dp-reading">{entry.surfaceReading}</div>}
          </div>
        </div>

        <div className="dp-tags">
          <span className="dp-pos">{entry.posLabel}</span>
          {entry.freqBucket > 0 && (
            <span className="dp-freq">
              <span className="dots">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} className={n <= entry.freqBucket ? "on" : ""} />
                ))}
              </span>
              <span className="flabel">{entry.freqLabel}</span>
            </span>
          )}
        </div>

        {entry.dictionaryForm && (
          <div className="dp-lemma">
            <span className="k">Dictionary form</span>
            <span className="v jp">
              {entry.dictionaryForm.lemma}
              {entry.dictionaryForm.reading && <span className="r">{entry.dictionaryForm.reading}</span>}
            </span>
          </div>
        )}

        <ol className="dp-defs">
          {entry.glosses.map((d, i) => (
            <li key={i}><span className="n">{i + 1}</span><span>{d}</span></li>
          ))}
        </ol>

        <div className="dp-foot">
          <button type="button" className="dp-action primary" onClick={onExplain}>
            <SparkIcon /> Explain
          </button>
          <button
            type="button"
            className={cn("dp-action save", saved && "saved")}
            onClick={onSave}
            disabled={!onSave}
            title={onSave ? undefined : "Coming soon"}
          >
            <BookmarkIcon filled={saved} /> {saved ? "Saved" : "Save word"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the stories**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { DictPopup, type DictEntry } from "./DictPopup";

const ENTRY: DictEntry = {
  surface: "歩いて",
  surfaceReading: "あるいて",
  posLabel: "Verb · te-form",
  freqBucket: 5,
  freqLabel: "Very common",
  dictionaryForm: { lemma: "歩く", reading: "あるく" },
  glosses: ["to walk", "to go on foot"],
};

const ANCHOR = { left: 120, bottom: 80, arrowLeft: 162, width: 324 };

function Demo(props: Partial<React.ComponentProps<typeof DictPopup>>) {
  return (
    <div className="player-page" data-theme="light" style={{ position: "relative", height: 360, background: "var(--bg-2)" }}>
      <DictPopup entry={ENTRY} pos={ANCHOR} saved={false} onExplain={() => {}} onClose={() => {}} {...props} />
    </div>
  );
}

const meta: Meta<typeof DictPopup> = { title: "Player/DictPopup", component: DictPopup };
export default meta;
type Story = StoryObj<typeof DictPopup>;

export const Default: Story = { render: () => <Demo onSave={() => {}} /> };
export const Saved: Story = { render: () => <Demo saved onSave={() => {}} /> };
export const SaveDisabled: Story = { render: () => <Demo /> };
```

- [ ] **Step 3: Verify in Storybook**

Run: `pnpm --filter @fuchine/ui storybook` (or the repo's Storybook command), open Player/DictPopup. Expected: popup renders with arrow, POS chip, 5 freq dots (all on), dictionary form, two glosses, Explain + Save word. `SaveDisabled` shows Save word greyed/disabled. (CSS lands in Task 7; layout may be unstyled until then — verify structure now, visuals after Task 7.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Player/DictPopup.tsx packages/ui/src/components/Player/DictPopup.stories.tsx
git commit -m "feat(ui): add DictPopup component"
```

---

## Task 2: MinedCard component + stories

**Files:**
- Create: `packages/ui/src/components/Player/MinedCard.tsx`
- Create: `packages/ui/src/components/Player/MinedCard.stories.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface MinedCardProps {
  sentence: string;                 // 毎朝川沿いを歩いています。
  clozeTarget: string | null;       // surface to blank, e.g. 歩いて (null → no blank)
  translation: string | null;
  target: { surface: string; reading: string | null } | null;
  sourceLabel: string;              // "Kyoto Slow Living · 5:24"
  onUndo: () => void;
  onViewDeck: () => void;
  onClose: () => void;
  className?: string;
}

function CheckIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14"><path d="M5 12l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
function CloseIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>);
}
function YoutubeIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14"><rect x="3" y="6" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" /></svg>);
}
function ArrowIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}

/** Render the sentence with the cloze target replaced by a blank. */
function renderCloze(sentence: string, target: string | null): ReactNode {
  if (!target || !sentence.includes(target)) return sentence;
  const i = sentence.indexOf(target);
  return (
    <>
      {sentence.slice(0, i)}
      <span className="cloze">［ ＿＿ ］</span>
      {sentence.slice(i + target.length)}
    </>
  );
}

export function MinedCard({
  sentence, clozeTarget, translation, target, sourceLabel, onUndo, onViewDeck, onClose, className,
}: MinedCardProps): ReactNode {
  return (
    <>
      <div className="scrim-soft" onClick={onClose} aria-hidden="true" />
      <div className="mined-wrap">
        <div className={cn("mined", className)} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mined to review">
          <div className="mined-top">
            <span className="mined-check"><CheckIcon /></span>
            <div className="mined-titles">
              <div className="mined-title">Mined to Review</div>
              <div className="mined-sub">1 new card · due now</div>
            </div>
            <button type="button" className="mined-x" onClick={onClose} title="Dismiss"><CloseIcon /></button>
          </div>

          <div className="mined-card">
            <span className="mined-card-tag">Front</span>
            <div className="mined-cloze jp">{renderCloze(sentence, clozeTarget)}</div>
            {translation && <div className="mined-card-en">{translation}</div>}
            <div className="mined-card-foot">
              {target && (
                <span className="mined-target jp">
                  {target.surface}{target.reading && <span className="r">{target.reading}</span>}
                </span>
              )}
              <span className="mined-from"><YoutubeIcon /> {sourceLabel}</span>
            </div>
          </div>

          <div className="mined-actions">
            <button type="button" className="mined-btn" onClick={onUndo}>Undo</button>
            <button type="button" className="mined-btn primary" onClick={onViewDeck}>View deck <ArrowIcon /></button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the stories**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { MinedCard } from "./MinedCard";

function Demo(props: Partial<React.ComponentProps<typeof MinedCard>>) {
  return (
    <div className="player-page" data-theme="light" style={{ position: "relative", height: 420, background: "var(--bg-2)" }}>
      <MinedCard
        sentence="毎朝川沿いを歩いています。"
        clozeTarget="歩いて"
        translation="Every morning, I walk along the river."
        target={{ surface: "歩いて", reading: "あるいて" }}
        sourceLabel="Kyoto Slow Living · 5:24"
        onUndo={() => {}}
        onViewDeck={() => {}}
        onClose={() => {}}
        {...props}
      />
    </div>
  );
}

const meta: Meta<typeof MinedCard> = { title: "Player/MinedCard", component: MinedCard };
export default meta;
type Story = StoryObj<typeof MinedCard>;

export const WithCloze: Story = { render: () => <Demo /> };
export const NoCloze: Story = { render: () => <Demo clozeTarget={null} target={null} /> };
```

- [ ] **Step 3: Verify in Storybook**

Open Player/MinedCard. Expected: check + "Mined to Review · 1 new card · due now", card with `毎朝川沿いを［ ＿＿ ］います。`, translation, target word, source, Undo + View deck. `NoCloze` shows the full sentence, no blank. (Visuals finalize after Task 7.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Player/MinedCard.tsx packages/ui/src/components/Player/MinedCard.stories.tsx
git commit -m "feat(ui): add MinedCard component"
```

---

## Task 3: Dictionary display mappers (TDD)

**Files:**
- Modify: `apps/web/lib/dictionary.ts`
- Create: `apps/web/lib/dictionary.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { freqBucket, posLabel, toDictEntry } from "./dictionary";

describe("freqBucket", () => {
  it("maps null/0 to 0 (unknown)", () => {
    expect(freqBucket(null)).toBe(0);
    expect(freqBucket(0)).toBe(0);
  });
  it("maps top ranks to 5 (very common)", () => {
    expect(freqBucket(1)).toBe(5);
    expect(freqBucket(1500)).toBe(5);
  });
  it("maps mid and rare ranks down the scale", () => {
    expect(freqBucket(5000)).toBe(4);
    expect(freqBucket(15000)).toBe(3);
    expect(freqBucket(30000)).toBe(2);
    expect(freqBucket(99999)).toBe(1);
  });
});

describe("posLabel", () => {
  it("maps a verb base form to Verb", () => {
    expect(posLabel("動詞", "歩く", "歩く")).toBe("Verb");
  });
  it("appends te-form when an inflected verb ends in て/で", () => {
    expect(posLabel("動詞", "歩いて", "歩く")).toBe("Verb · te-form");
  });
  it("maps common POS and falls back to the raw value", () => {
    expect(posLabel("名詞", "川", "川")).toBe("Noun");
    expect(posLabel("助詞", "を", "を")).toBe("Particle");
    expect(posLabel("xyz", "x", "x")).toBe("xyz");
    expect(posLabel(null, "x", "x")).toBe("Word");
  });
});

describe("toDictEntry", () => {
  it("combines token + entry into the popup shape", () => {
    const entry = toDictEntry(
      { surface: "歩いて", reading: "あるいて", pos: "動詞", lemma: "歩く" },
      { lemma: "歩く", reading: "あるく", pos: "動詞", definitions: [{ glosses: ["to walk", "to go on foot"] }], frequencyRank: 800 },
    );
    expect(entry.surface).toBe("歩いて");
    expect(entry.surfaceReading).toBe("あるいて");
    expect(entry.posLabel).toBe("Verb · te-form");
    expect(entry.freqBucket).toBe(5);
    expect(entry.freqLabel).toBe("Very common");
    expect(entry.dictionaryForm).toEqual({ lemma: "歩く", reading: "あるく" });
    expect(entry.glosses).toEqual(["to walk", "to go on foot"]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @fuchine/web exec vitest run lib/dictionary.test.ts`
Expected: FAIL — `freqBucket`/`posLabel`/`toDictEntry` are not exported.

- [ ] **Step 3: Implement the mappers**

Append to `apps/web/lib/dictionary.ts`:

```ts
import type { DictEntry } from "@fuchine/ui";

export const FREQ_LABELS = ["", "Rare", "Uncommon", "Common", "Common", "Very common"] as const;

/** Absolute frequency rank (1 = most common) → 0–5 display bucket. */
export function freqBucket(rank: number | null): number {
  if (rank == null || rank <= 0) return 0;
  if (rank <= 1500) return 5;
  if (rank <= 5000) return 4;
  if (rank <= 15000) return 3;
  if (rank <= 30000) return 2;
  return 1;
}

const POS_MAP: Record<string, string> = {
  名詞: "Noun", 動詞: "Verb", 形容詞: "Adjective", 形容動詞: "Adjective",
  副詞: "Adverb", 助詞: "Particle", 助動詞: "Auxiliary", 連体詞: "Adnominal",
  接続詞: "Conjunction", 感動詞: "Interjection", 記号: "Symbol",
};

/** Friendly POS label, with a te-form hint for inflected verbs. */
export function posLabel(pos: string | null, surface: string, lemma: string): string {
  if (!pos) return "Word";
  const base = POS_MAP[pos] ?? pos;
  const inflected = surface !== lemma && /[てで]$/.test(surface);
  return base === "Verb" && inflected ? "Verb · te-form" : base;
}

/** Combine a focal token with its fetched dictionary entry into popup display data. */
export function toDictEntry(
  token: { surface: string; reading: string | null; pos: string | null; lemma: string },
  entry: { lemma: string; reading: string | null; pos: string | null; definitions: { glosses: string[] }[]; frequencyRank: number | null },
): DictEntry {
  const bucket = freqBucket(entry.frequencyRank);
  return {
    surface: token.surface,
    surfaceReading: token.reading,
    posLabel: posLabel(token.pos, token.surface, token.lemma),
    freqBucket: bucket,
    freqLabel: FREQ_LABELS[bucket] ?? "",
    dictionaryForm: { lemma: entry.lemma, reading: entry.reading },
    glosses: entry.definitions.flatMap((d) => d.glosses),
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @fuchine/web exec vitest run lib/dictionary.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/dictionary.ts apps/web/lib/dictionary.test.ts
git commit -m "feat(web): dictionary display mappers (freqBucket, posLabel, toDictEntry)"
```

---

## Task 4: deleteCard + DELETE /api/cards (for Undo)

**Files:**
- Modify: `apps/web/lib/cards.ts`
- Modify: `apps/web/app/api/cards/route.ts`

- [ ] **Step 1: Add `deleteCard` to `lib/cards.ts`**

Append (the file already imports `and`, `eq`, `sentenceCards`, and exports `Result`):

```ts
/** Delete a card owned by the user — backs the mine "Undo". */
export async function deleteCard(
  db: Database,
  userId: string,
  cardId?: string,
): Promise<Result> {
  if (!cardId) return { status: 400, body: { error: "id is required" } };
  const deleted = await db
    .delete(sentenceCards)
    .where(and(eq(sentenceCards.id, cardId), eq(sentenceCards.userId, userId)))
    .returning({ id: sentenceCards.id });
  if (deleted.length === 0) return { status: 404, body: { error: "card not found" } };
  return { status: 200, body: { deleted: true, id: cardId } };
}
```

- [ ] **Step 2: Add the DELETE handler**

Edit `apps/web/app/api/cards/route.ts` — update the import and add the handler:

```ts
import { mineSentence, deleteCard } from "@/lib/cards";
```

```ts
// DELETE /api/cards?id=<cardId> — remove a mined card (Undo).
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  const result = await deleteCard(db, session.user.id, id);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fuchine/web typecheck`
Expected: Done (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/cards.ts apps/web/app/api/cards/route.ts
git commit -m "feat(web): DELETE /api/cards to support mine Undo"
```

---

## Task 5: Clickable tokens + Mine button in PlayerFocalSubtitles

**Files:**
- Modify: `packages/ui/src/components/Player/PlayerFocalSubtitles.tsx`

- [ ] **Step 1: Extend props and token rendering**

Replace the props interface and `renderToken`/component body so tokens with a `wordEntryId` are clickable, the active one is highlighted, refs are exposed, and a Mine button is added. Full new file:

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type FocalToken = {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string | null;
  wordEntryId: string | null;
};

export type FocalLine = {
  id: string;
  textOriginal: string;
  textTranslation: string | null;
  tokens: FocalToken[];
};

export interface PlayerFocalSubtitlesProps {
  line: FocalLine;
  showTranslation: boolean;
  showFurigana: boolean;
  onExplain?: () => void;
  onMine?: () => void;
  /** Click a resolved token (has wordEntryId). */
  onTokenClick?: (token: FocalToken, index: number) => void;
  /** Index of the token whose popup is open (highlight). */
  activeTokenIndex?: number | null;
  /** Ref setter so the parent can anchor the popup to a token element. */
  setTokenRef?: (index: number, el: HTMLElement | null) => void;
  className?: string;
}

export function PlayerFocalSubtitles({
  line,
  showTranslation,
  showFurigana,
  onExplain,
  onMine,
  onTokenClick,
  activeTokenIndex,
  setTokenRef,
  className,
}: PlayerFocalSubtitlesProps) {
  const isSfx = line.textOriginal.trimStart().startsWith("♪");
  const tokens = line.tokens.length > 0
    ? line.tokens
    : line.textOriginal.split(/(\s+)/).map((surface) => ({
        surface, lemma: surface, reading: null, pos: null, wordEntryId: null,
      }));

  const renderToken = (t: FocalToken, i: number): ReactNode => {
    const clickable = !!t.wordEntryId && !!onTokenClick;
    const inner = showFurigana && t.reading && t.reading !== t.surface
      ? (<ruby>{t.surface}<rt className="jp-rb">{t.reading}</rt></ruby>)
      : t.surface;
    return (
      <span
        key={i}
        ref={(el) => setTokenRef?.(i, el)}
        className={cn("jp-tok", clickable && "tok-clickable", activeTokenIndex === i && "active")}
        data-word-id={t.wordEntryId ?? "null"}
        onClick={clickable ? () => onTokenClick!(t, i) : undefined}
      >
        {inner}
      </span>
    );
  };

  return (
    <div className={cn("focal-subs", className)}>
      <div className="focal-subs-ja jp" aria-label="Original subtitle">
        {isSfx && <span className="sfx-mark" aria-hidden="true">♪</span>}
        {tokens.map((t, i) => renderToken(t, i))}
      </div>
      {showTranslation && line.textTranslation && (
        <div className="focal-subs-en">{line.textTranslation}</div>
      )}
      {(onExplain || onMine) && (
        <div className="sent-actions">
          {onExplain && (
            <button type="button" className="sent-btn" onClick={onExplain}>
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" fill="currentColor" /></svg>
              Explain
            </button>
          )}
          {onMine && (
            <button type="button" className="sent-btn" onClick={onMine}>
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Mine sentence
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @fuchine/ui typecheck`
Expected: Done. (Existing `PlayerFocalSubtitles.stories.tsx` still compiles — new props are optional.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Player/PlayerFocalSubtitles.tsx
git commit -m "feat(ui): clickable focal tokens + Mine sentence button"
```

---

## Task 6: Player state + PlayerStage anchoring

**Files:**
- Modify: `packages/ui/src/components/Player/Player.tsx`
- Modify: `packages/ui/src/components/Player/PlayerStage.tsx`

- [ ] **Step 1: Extend `PlayerProps` and add interaction state in `Player.tsx`**

Add to imports:

```tsx
import type { DictEntry } from "./DictPopup";
import type { FocalToken } from "./PlayerFocalSubtitles";
```

Add to `PlayerProps`:

```tsx
  /** Fetch the display-ready dictionary entry for a clicked token. */
  onFetchDictionary?: (token: FocalToken) => Promise<DictEntry>;
  /** Mine the current line; resolves with the created card id. */
  onMineSentence?: (lineId: string) => Promise<{ cardId: string | null; created: boolean }>;
  /** Undo a mine by deleting the card. */
  onUndoMine?: (cardId: string) => Promise<void>;
  /** Navigate to the review deck. */
  onViewDeck?: () => void;
```

Add a snapshot type (top of the file, near the other types) and state. The
MinedCard content is **snapshotted** when Mine is clicked, so an open toast
keeps its content even as playback advances the focal line:

```tsx
type MinedSnapshot = {
  sentence: string;
  clozeTarget: string | null;
  translation: string | null;
  target: { surface: string; reading: string | null } | null;
  sourceLabel: string;
};
```

```tsx
  const [activeTokenIndex, setActiveTokenIndex] = useState<number | null>(null);
  const [dictEntry, setDictEntry] = useState<DictEntry | null>(null);
  const [minedTarget, setMinedTarget] = useState<{ surface: string; reading: string | null } | null>(null);
  const [minedData, setMinedData] = useState<MinedSnapshot | null>(null);
  const [minedCardId, setMinedCardId] = useState<string | null>(null);
```

Add handlers (near the other `useCallback`s):

```tsx
  const onTokenClick = useCallback(
    (token: FocalToken, index: number) => {
      if (!onFetchDictionary) return;
      setActiveTokenIndex(index);
      setMinedTarget({ surface: token.surface, reading: token.reading });
      setDictEntry(null);
      void onFetchDictionary(token).then(setDictEntry).catch(() => setActiveTokenIndex(null));
    },
    [onFetchDictionary],
  );

  const closePopup = useCallback(() => { setActiveTokenIndex(null); setDictEntry(null); }, []);

  const explainFromPopup = useCallback(() => {
    closePopup();
    setActiveRailTab("explain");
  }, [closePopup]);

  const mineCurrent = useCallback(() => {
    const idx = currentLineIdxRef.current;
    const line = idx >= 0 ? (lines[idx] as PlayerSubtitleLine) : undefined;
    if (!line || !onMineSentence) return;
    setMinedData({
      sentence: line.textOriginal,
      clozeTarget: minedTarget?.surface ?? null,
      translation: translations.get(line.id) ?? null,
      target: minedTarget,
      sourceLabel: `${video.channel ?? ""}${video.channel ? " · " : ""}${fmt(line.tStartMs)}`,
    });
    setMinedCardId(null);
    closePopup();
    void onMineSentence(line.id).then((r) => setMinedCardId(r.cardId)).catch(() => {});
  }, [lines, onMineSentence, closePopup, minedTarget, translations, video.channel]);

  const undoMine = useCallback(() => {
    if (minedCardId && onUndoMine) void onUndoMine(minedCardId).catch(() => {});
    setMinedData(null);
    setMinedCardId(null);
  }, [minedCardId, onUndoMine]);
```

(Token element refs for anchoring are owned by `PlayerStage`, not `Player`.)

Clear the popup + the cloze candidate when the focal line changes (the open
mined toast is left alone — it holds its own snapshot):

```tsx
  useEffect(() => { setActiveTokenIndex(null); setDictEntry(null); setMinedTarget(null); }, [currentLineIdx]);
```

- [ ] **Step 2: Pass the new props through `PlayerStage`**

In the `Player.tsx` render, replace the `<PlayerStage ... />` usage to pass the dictionary/mine wiring (add these props alongside the existing ones):

```tsx
            onExplain={openExplain}
            onMine={onMineSentence ? mineCurrent : undefined}
            onTokenClick={onFetchDictionary ? onTokenClick : undefined}
            activeTokenIndex={activeTokenIndex}
            dictEntry={dictEntry}
            onClosePopup={closePopup}
            onExplainPopup={explainFromPopup}
            mined={minedData}
            onUndoMine={undoMine}
            onCloseMined={() => { setMinedData(null); setMinedCardId(null); }}
            onViewDeck={onViewDeck}
```

- [ ] **Step 3: Render the popup + overlay with anchoring in `PlayerStage.tsx`**

Replace `PlayerStage.tsx` with the version below (adds `stageRef`, anchoring `useLayoutEffect`, and renders `DictPopup` + `MinedCard`):

```tsx
"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { PlayerVideo, type PlayerVideoHandle, type PlayerVideoProps } from "./PlayerVideo";
import { PlayerFocalSubtitles, type FocalLine, type FocalToken } from "./PlayerFocalSubtitles";
import { PlayerControlBar, type PlayerControlBarProps } from "./PlayerControlBar";
import { DictPopup, type DictEntry, type PopupAnchor } from "./DictPopup";
import { MinedCard, type MinedCardProps } from "./MinedCard";

type MinedData = Pick<MinedCardProps, "sentence" | "clozeTarget" | "translation" | "target" | "sourceLabel">;

export interface PlayerStageProps {
  videoId: string;
  startAt?: number;
  focalLine: FocalLine | null;
  showTranslation: boolean;
  showFurigana: boolean;
  onReady: PlayerVideoProps["onReady"];
  onStateChange: PlayerVideoProps["onStateChange"];
  onError: PlayerVideoProps["onError"];
  controlBar: Omit<PlayerControlBarProps, "showTranslation" | "className">;
  onExplain?: () => void;
  onMine?: () => void;
  onTokenClick?: (token: FocalToken, index: number) => void;
  activeTokenIndex?: number | null;
  dictEntry?: DictEntry | null;
  onClosePopup?: () => void;
  onExplainPopup?: () => void;
  mined?: MinedData | null;
  onUndoMine?: () => void;
  onCloseMined?: () => void;
  onViewDeck?: () => void;
  className?: string;
}

const POPUP_W = 324;

export function PlayerStage(props: PlayerStageProps): ReactNode {
  const {
    videoId, startAt, focalLine, showTranslation, showFurigana, onReady, onStateChange, onError,
    controlBar, onExplain, onMine, onTokenClick, activeTokenIndex, dictEntry,
    onClosePopup, onExplainPopup, mined, onUndoMine, onCloseMined, onViewDeck, className,
  } = props;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const tokenEls = useRef<Map<number, HTMLElement>>(new Map());
  const [anchor, setAnchor] = useState<PopupAnchor | null>(null);

  const popupOpen = activeTokenIndex != null && !!dictEntry;

  const handleTokenRef = (index: number, el: HTMLElement | null) => {
    if (el) tokenEls.current.set(index, el); else tokenEls.current.delete(index);
  };

  useLayoutEffect(() => {
    if (activeTokenIndex == null) { setAnchor(null); return; }
    const compute = () => {
      const stage = stageRef.current;
      const tok = tokenEls.current.get(activeTokenIndex);
      if (!stage || !tok) return;
      const s = stage.getBoundingClientRect();
      const r = tok.getBoundingClientRect();
      const pad = 18, gap = 12;
      const center = r.left - s.left + r.width / 2;
      const left = Math.max(pad, Math.min(center - POPUP_W / 2, s.width - POPUP_W - pad));
      setAnchor({ left, bottom: s.height - (r.top - s.top) + gap, arrowLeft: center - left, width: POPUP_W });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [activeTokenIndex, showTranslation, focalLine]);

  return (
    <div className={cn("stage", className)} ref={stageRef}>
      <PlayerVideo videoId={videoId} startAt={startAt} onReady={onReady} onStateChange={onStateChange} onError={onError} />
      {focalLine ? (
        <PlayerFocalSubtitles
          line={focalLine}
          showTranslation={showTranslation}
          showFurigana={showFurigana}
          onExplain={onExplain}
          onMine={onMine}
          onTokenClick={onTokenClick}
          activeTokenIndex={activeTokenIndex}
          setTokenRef={handleTokenRef}
        />
      ) : (
        <div className="focal-subs-empty" aria-hidden="true" />
      )}
      <PlayerControlBar {...controlBar} showTranslation={showTranslation} />

      {popupOpen && dictEntry && onClosePopup && onExplainPopup && (
        <DictPopup entry={dictEntry} pos={anchor} saved={false} onExplain={onExplainPopup} onClose={onClosePopup} />
      )}

      {mined && (
        <MinedCard
          {...mined}
          onUndo={onUndoMine ?? (() => {})}
          onViewDeck={onViewDeck ?? (() => {})}
          onClose={onCloseMined ?? (() => {})}
        />
      )}
    </div>
  );
}

export type { PlayerVideoHandle };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @fuchine/ui typecheck`
Expected: Done.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Player/Player.tsx packages/ui/src/components/Player/PlayerStage.tsx
git commit -m "feat(ui): wire token popup + mine overlay into the player stage"
```

---

## Task 7: Export components, wire PlayerView, port CSS

**Files:**
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/web/app/videos/[id]/player-view.tsx`
- Modify: `apps/web/app/videos/[id]/player.css`

- [ ] **Step 1: Export the new components from `@fuchine/ui`**

Add after the existing `PlayerExplain` exports in `packages/ui/src/index.ts`:

```ts
export { DictPopup } from "./components/Player/DictPopup";
export type { DictPopupProps, DictEntry, PopupAnchor } from "./components/Player/DictPopup";
export { MinedCard } from "./components/Player/MinedCard";
export type { MinedCardProps } from "./components/Player/MinedCard";
```

- [ ] **Step 2: Wire callbacks in `player-view.tsx`**

Add the imports and callbacks; pass them to `<Player>`. Insert alongside the existing `onFetchExplanation`:

```tsx
import { toDictEntry } from "@/lib/dictionary";
```

```tsx
  const onFetchDictionary = useCallback(
    async (token: { surface: string; reading: string | null; pos: string | null; lemma: string; wordEntryId: string | null }) => {
      if (!token.wordEntryId) throw new Error("token has no dictionary entry");
      const res = await fetch(`/api/dictionary?id=${encodeURIComponent(token.wordEntryId)}`);
      if (!res.ok) throw new Error(`dictionary failed: ${res.status}`);
      const data = (await res.json()) as { entry: { lemma: string; reading: string | null; pos: string | null; definitions: { glosses: string[] }[]; frequencyRank: number | null } };
      return toDictEntry(token, data.entry);
    },
    [],
  );

  const onMineSentence = useCallback(
    async (lineId: string) => {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleLineId: lineId }),
      });
      if (!res.ok) throw new Error(`mine failed: ${res.status}`);
      const data = (await res.json()) as { card?: { id?: string }; created?: boolean };
      return { cardId: data.card?.id ?? null, created: data.created === true };
    },
    [],
  );

  const onUndoMine = useCallback(async (cardId: string) => {
    await fetch(`/api/cards?id=${encodeURIComponent(cardId)}`, { method: "DELETE" });
  }, []);
```

Pass to `<Player>`:

```tsx
      onFetchDictionary={onFetchDictionary}
      onMineSentence={onMineSentence}
      onUndoMine={onUndoMine}
      onViewDeck={() => router.push("/review")}
```

Note: the `onFetchDictionary` prop type uses `FocalToken`; the inline callback's token param is structurally compatible (it has the needed fields). If TypeScript complains, import `FocalToken` type via `PlayerSubtitleLine`'s token shape and annotate accordingly.

- [ ] **Step 3: Port the CSS**

Open `claude-design/player.css` and copy these rule blocks into `apps/web/app/videos/[id]/player.css`, scoping each selector under `.player-page ` to match the file's existing convention (e.g. `.dict-pop` → `.player-page .dict-pop`):

- `.scrim-soft`
- `.dict-pop`, `.dict-arrow`
- `.dp-head`, `.dp-word`, `.dp-reading`
- `.dp-tags`, `.dp-pos`, `.dp-freq`, `.dots`, `.dots i`, `.dots i.on`, `.flabel`
- `.dp-lemma`, `.dp-lemma .k`, `.dp-lemma .v`, `.dp-lemma .r`
- `.dp-defs`, `.dp-defs li`, `.dp-defs .n`
- `.dp-foot`, `.dp-action`, `.dp-action.primary`, `.dp-action.save`, `.dp-action.save.saved`
- `.sent-actions`, `.sent-btn`, `.sent-btn.on`
- `.mined-wrap`, `.mined`, `.mined-top`, `.mined-check`, `.mined-titles`, `.mined-title`, `.mined-sub`, `.mined-x`
- `.mined-card`, `.mined-card-tag`, `.mined-cloze`, `.cloze`, `.mined-card-en`, `.mined-card-foot`, `.mined-target`, `.mined-target .r`, `.mined-from`
- `.mined-actions`, `.mined-btn`, `.mined-btn.primary`

Then add the clickable-token states (the design uses `.tok`; this codebase uses `.jp-tok`):

```css
.player-page .jp-tok.tok-clickable { cursor: pointer; border-radius: 5px; transition: background 0.12s, color 0.12s; }
.player-page .jp-tok.tok-clickable:hover { background: var(--accent-soft-2); color: var(--link); }
.player-page .jp-tok.active { background: var(--link); color: var(--surface); }
```

- [ ] **Step 4: Typecheck both packages**

Run: `pnpm --filter @fuchine/ui --filter @fuchine/web typecheck`
Expected: Done for both.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.ts apps/web/app/videos/[id]/player-view.tsx "apps/web/app/videos/[id]/player.css"
git commit -m "feat(web): wire dictionary popup + mining into the player; port CSS"
```

---

## Task 8: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd apps/web && pnpm dev
```

Open the player for a video with tokenized lines (authenticated). Pick a content word (e.g. a verb) in the focal subtitle.

- [ ] **Step 2: Dictionary popup**

Click the token. Expected: anchored popup above the token with reading, POS chip, frequency dots, dictionary form, and glosses from the real entry. Clicking outside closes it; clicking **Explain** switches the rail to the Explain tab.

- [ ] **Step 3: Mine + Undo**

Click **Mine sentence**. Expected: `MinedCard` appears with the current sentence (the clicked word clozed), translation, source (channel · timestamp). Verify a row was created:

```bash
docker compose exec -T postgres psql -U fuchine -d fuchine -c \
  "SELECT id, card_type FROM sentence_cards ORDER BY created_at DESC LIMIT 1;"
```

Click **Undo**. Expected: toast closes and the row is gone:

```bash
docker compose exec -T postgres psql -U fuchine -d fuchine -c \
  "SELECT count(*) FROM sentence_cards WHERE id = '<id from above>';"
```

Expected: `0`.

- [ ] **Step 4: View deck**

Mine again, click **View deck**. Expected: navigates to `/review`.

---

## Notes for the executor

- **Frequency thresholds** in `freqBucket` are an approximation; if the seed's `frequency_rank` distribution differs, adjust the thresholds — the unit test documents the intended buckets.
- **POS format**: `posLabel` assumes IPADIC Japanese POS strings from kuromoji (e.g. `動詞`). If `token.pos` is already English or a different format, extend `POS_MAP`; the raw value is the fallback so nothing breaks.
- **Anchoring** mirrors `claude-design/player.jsx`'s `useLayoutEffect`. The popup is positioned relative to `.stage`; ensure `.stage` is `position: relative` (it already is in `player.css`).
- Do **not** persist the cloze target or wire **Save word** — both are explicitly out of scope (see the spec).
```
