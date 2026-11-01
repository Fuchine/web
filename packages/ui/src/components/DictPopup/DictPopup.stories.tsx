import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DictPopup, type DictPopupProps } from "./DictPopup";

const ENTRY = {
  word: "歩く",
  reading: "あるく",
  pos: "Godan verb · intransitive",
  frequencyRank: 5,
  definitions: [
    {
      glosses: ["to walk", "to go on foot"],
      partsOfSpeech: ["verb"],
      tags: ["common"],
    },
    {
      glosses: [
        "to go (somewhere) step by step",
        "to make one's way",
      ],
      partsOfSpeech: ["verb"],
      tags: ["figurative"],
    },
  ],
  lemma: { word: "歩く", reading: "あるく" },
};

const POSITION = { left: 120, bottom: 80, arrowLeft: 180, w: 324 };

const meta: Meta<typeof DictPopup> = {
  title: "UI/DictPopup",
  component: DictPopup,
  decorators: [
    (Story) => (
      <div className="relative bg-bg" style={{ height: 320 }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DictPopup>;

export const Default: Story = {
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Saved: Story = {
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: true,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Loading: Story = {
  args: {
    position: POSITION,
    entry: null,
    loading: true,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Error: Story = {
  args: {
    position: POSITION,
    entry: null,
    loading: false,
    error: "Could not load definition.",
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const NoLemma: Story = {
  args: {
    position: POSITION,
    entry: { ...ENTRY, lemma: undefined },
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

// T3.2 — pitch accent (Kanjium) under the tags, one story per category.
const withPitch = (word: string, reading: string, gloss: string, ...positions: number[]): DictPopupProps => ({
  position: POSITION,
  entry: {
    word,
    reading,
    pos: "n",
    frequencyRank: 4,
    definitions: [{ glosses: [gloss], partsOfSpeech: ["noun"] }],
    lemma: null,
    pitch: [{ reading, positions, source: "kanjium" }],
  },
  loading: false,
  error: null,
  saved: false,
  onExplain: () => {},
  onSaveWord: () => {},
  onClose: () => {},
});

export const PitchHeiban: Story = { args: withPitch("端", "はし", "edge; end", 0) };
export const PitchAtamadaka: Story = { args: withPitch("箸", "はし", "chopsticks", 1) };
export const PitchNakadaka: Story = { args: withPitch("日本", "にほん", "Japan", 2) };
export const PitchOdaka: Story = { args: withPitch("橋", "はし", "bridge", 2) };
/** Several accents for one reading — all listed. */
export const PitchMultiple: Story = { args: withPitch("二つ", "ふたつ", "two (things)", 0, 3) };

// T3.7 — per-user token correction: the "Fix" action and its badge.
export const WithFix: Story = {
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
    onFix: () => {},
  } as DictPopupProps,
};

export const CorrectedByYou: Story = {
  args: { ...(WithFix.args as DictPopupProps), corrected: true },
};

/** A token without an entry (a name, a split word) can still be fixed. */
export const NoEntryFixable: Story = {
  args: {
    position: POSITION,
    entry: null,
    loading: false,
    error: "No dictionary entry.",
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
    onFix: () => {},
  } as DictPopupProps,
};

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark" className="relative bg-bg" style={{ height: 320 }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

// T3.4 — imported Yomitan dictionaries under the JMdict entry, in the user's
// order (a monolingual one first here), plus frequency-list ranks and an
// imported pitch source next to Kanjium. Invented definitions, not a real
// dictionary's text.
export const ImportedDictionaries: Story = {
  args: {
    ...(Default.args as DictPopupProps),
    entry: {
      ...ENTRY,
      pitch: [
        { reading: "あるく", positions: [2], source: "kanjium" },
        { reading: "あるく", positions: [2], source: "Example Pitch Dict" },
      ],
      frequencies: [
        { dictionaryId: "f1", title: "Example Freq", rank: 812, display: "812" },
        { dictionaryId: "f2", title: "Anime freq", rank: 1430, display: "1430㋕" },
      ],
      dictionaries: [
        {
          dictionaryId: "d1",
          title: "Example 国語辞典",
          monolingual: true,
          entries: [{
            expression: "歩く", reading: "あるく", tags: ["動五"],
            definitions: [{
              type: "sc",
              content: [
                { tag: "span", style: { fontWeight: "bold" }, content: "【歩く】" },
                { tag: "ol", content: [
                  { tag: "li", content: ["足を交互に前へ出して進む。"] },
                  { tag: "li", content: ["あちこちを", { tag: "ruby", content: ["巡", { tag: "rt", content: "めぐ" }] }, "る。"] },
                ] },
                { tag: "a", href: "https://example.com/aruku", content: "source" },
              ],
            }],
          }],
        },
        {
          dictionaryId: "d2",
          title: "Example J-E",
          monolingual: false,
          entries: [{ expression: "歩く", reading: "あるく", tags: [], definitions: [{ type: "text", text: "to walk; to stroll" }] }],
        },
      ],
    },
  } as DictPopupProps,
};
