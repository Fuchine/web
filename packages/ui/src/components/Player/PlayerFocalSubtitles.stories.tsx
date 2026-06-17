import type { Meta, StoryObj } from "@storybook/react";
import { PlayerFocalSubtitles, type FocalLine } from "./PlayerFocalSubtitles";

const SAMPLE_LINE: FocalLine = {
  id: "1",
  textOriginal: "毎朝川沿いを歩いています。",
  textTranslation: "Every morning, I walk along the river.",
  tokens: [
    { surface: "毎朝", lemma: "毎朝", reading: "まいあさ", pos: "Noun", wordEntryId: "w1" },
    { surface: "川沿い", lemma: "川沿い", reading: "かわぞい", pos: "Noun", wordEntryId: "w2" },
    { surface: "を", lemma: "を", reading: null, pos: "Particle", wordEntryId: null },
    { surface: "歩いて", lemma: "歩く", reading: "あるいて", pos: "Verb", wordEntryId: "w3" },
    { surface: "います", lemma: "いる", reading: "います", pos: "Aux", wordEntryId: "w4" },
    { surface: "。", lemma: "。", reading: null, pos: "Punct", wordEntryId: null },
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
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: false },
};

export const WithFurigana: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: true },
};

export const TranslationHidden: Story = {
  args: { line: SAMPLE_LINE, showTranslation: false, showFurigana: false },
};

export const SfxLine: Story = {
  args: { line: SFX_LINE, showTranslation: true, showFurigana: false },
};

export const Dark: Story = {
  args: { line: SAMPLE_LINE, showTranslation: true, showFurigana: true },
  decorators: [(Story) => <div data-theme="dark" className="bg-bg p-8"><Story /></div>],
};
