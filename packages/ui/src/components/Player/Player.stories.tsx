import type { Meta, StoryObj } from "@storybook/react";
import { Player, type PlayerSubtitleLine, type PlayerVideo } from "./Player";

const VIDEO: PlayerVideo = {
  id: "v1",
  title: "京都の朝、静かな散歩 — A quiet morning walk in Kyoto",
  channel: "Kyoto Slow Living",
  sourceId: "dQw4w9WgXcQ",
};

const LINES: PlayerSubtitleLine[] = [
  { id: "a", idx: 0, tStartMs: 312_000, tEndMs: 316_000, textOriginal: "おはようございます。", textTranslation: "Good morning.", tokens: [] },
  { id: "b", idx: 1, tStartMs: 316_000, tEndMs: 324_000, textOriginal: "今日は京都の鴨川に来ています。", textTranslation: "Today I'm here at the Kamo River in Kyoto.", tokens: [] },
  { id: "c", idx: 2, tStartMs: 324_000, tEndMs: 331_000, textOriginal: "毎朝川沿いを歩いています。", textTranslation: "Every morning, I walk along the river.", tokens: [
    { surface: "毎朝", lemma: "毎朝", reading: "まいあさ", romaji: "maiasa", pos: "Noun", wordEntryId: "w1" },
    { surface: "川沿い", lemma: "川沿い", reading: "かわぞい", romaji: "kawazoi", pos: "Noun", wordEntryId: "w2" },
    { surface: "を", lemma: "を", reading: null, romaji: "wo", pos: "Particle", wordEntryId: null },
    { surface: "歩いて", lemma: "歩く", reading: "あるいて", romaji: "aruite", pos: "Verb", wordEntryId: "w3" },
    { surface: "います", lemma: "いる", reading: "います", romaji: "imasu", pos: "Aux", wordEntryId: "w4" },
    { surface: "。", lemma: "。", reading: null, romaji: null, pos: "Punct", wordEntryId: null },
  ] },
  { id: "d", idx: 3, tStartMs: 331_000, tEndMs: 338_000, textOriginal: "空気がとても澄んでいて、気持ちがいいですね。", textTranslation: "The air is so clear — it feels wonderful.", tokens: [] },
  { id: "e", idx: 4, tStartMs: 338_000, tEndMs: 345_000, textOriginal: "少し寒いですが、散歩には最適です。", textTranslation: "It's a bit cold, but it's perfect for a walk.", tokens: [] },
];

const meta: Meta<typeof Player> = {
  title: "Player/Full",
  component: Player,
  decorators: [(Story) => <div className="h-screen"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof Player>;

export const Rest: Story = {
  args: {
    video: VIDEO,
    lines: LINES,
    account: { name: "Mai Tanaka", sub: "mai@fuchi.app" },
    onBack: () => undefined,
  },
};

export const Dark: Story = {
  args: Rest.args,
  decorators: [
    (Story) => (
      <div data-theme="dark" className="h-screen">
        <Story />
      </div>
    ),
  ],
};
