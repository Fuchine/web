import type { Meta, StoryObj } from "@storybook/react";
import { PlayerFocalSubtitles, type FocalLine } from "./PlayerFocalSubtitles";
import { subtitleVisibility, type WordStatus } from "../../lib/listening";

const STATUSES: Record<string, WordStatus> = { w1: "known", w3: "seen", w4: "known" };
const ALL = { japanese: true, translation: true };

const SAMPLE_LINE: FocalLine = {
  id: "1",
  textOriginal: "毎朝川沿いを歩いています。",
  textTranslation: "Every morning, I walk along the river.",
  tokens: [
    { surface: "毎朝", lemma: "毎朝", reading: "まいあさ", romaji: "maiasa", pos: "Noun", wordEntryId: "w1" },
    { surface: "川沿い", lemma: "川沿い", reading: "かわぞい", romaji: "kawazoi", pos: "Noun", wordEntryId: "w2" },
    { surface: "を", lemma: "を", reading: null, romaji: "wo", pos: "Particle", wordEntryId: null },
    { surface: "歩いて", lemma: "歩く", reading: "あるいて", romaji: "aruite", pos: "Verb", wordEntryId: "w3" },
    { surface: "います", lemma: "いる", reading: "います", romaji: "imasu", pos: "Aux", wordEntryId: "w4" },
    { surface: "。", lemma: "。", reading: null, romaji: null, pos: "Punct", wordEntryId: null },
  ],
};

const SFX_LINE: FocalLine = {
  id: "2",
  textOriginal: "♪ BGM ♪",
  textTranslation: null,
  tokens: [],
};

const meta: Meta<typeof PlayerFocalSubtitles> = {
  title: "Player/FocalSubtitles",
  component: PlayerFocalSubtitles,
  decorators: [
    (Story) => (
      <div className="bg-bg p-8">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PlayerFocalSubtitles>;

export const Default: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: false, showRomaji: true },
};

export const WithFurigana: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: true, showRomaji: true },
};

export const TranslationHidden: Story = {
  args: { line: SAMPLE_LINE, showTranslation: false, showFurigana: false, showRomaji: true },
};

export const KnownWordColors: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: false, showRomaji: true, wordStatuses: STATUSES, colorKnown: true },
};

/** Hide JP toggle: the line is masked, translation stays. */
export const JapaneseHidden: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: false, showRomaji: true, showJapanese: false },
};

/** Primed listening, step 1: translation shown, video paused, JP hidden. */
export const PrimedPreview: Story = {
  args: {
    line: SAMPLE_LINE, showFurigana: false, showRomaji: true, primedPhase: "preview",
    showTranslation: subtitleVisibility("preview", ALL).translation,
    showJapanese: subtitleVisibility("preview", ALL).japanese,
  },
};

/** Primed listening, step 2: the line plays with everything hidden. */
export const PrimedListen: Story = {
  args: {
    line: SAMPLE_LINE, showFurigana: false, showRomaji: true, primedPhase: "listen",
    showTranslation: subtitleVisibility("listen", ALL).translation,
    showJapanese: subtitleVisibility("listen", ALL).japanese,
  },
};

/** Primed listening, step 3: the line ended — JP revealed. */
export const PrimedReveal: Story = {
  args: {
    line: SAMPLE_LINE, showFurigana: false, showRomaji: true, primedPhase: "reveal",
    showTranslation: true, showJapanese: true, wordStatuses: STATUSES, colorKnown: true,
  },
};

export const SfxLine: Story = {
  args: { line: SFX_LINE, showTranslation: true, showFurigana: false, showRomaji: true },
};

export const Dark: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: true, showRomaji: true, wordStatuses: STATUSES, colorKnown: true },
  decorators: [(Story) => <div data-theme="dark" className="bg-bg p-8"><Story /></div>],
};
