import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlayerTranscript, type TranscriptLine } from "./PlayerTranscript";

const SAMPLE: TranscriptLine[] = [
  { id: "a", idx: 0, tStartMs: 312_000, textOriginal: "おはようございます。", textTranslation: "Good morning.", tokens: [] },
  { id: "b", idx: 1, tStartMs: 316_000, textOriginal: "今日は京都の鴨川に来ています。", textTranslation: "Today I'm here at the Kamo River in Kyoto.", tokens: [] },
  { id: "c", idx: 2, tStartMs: 324_000, textOriginal: "毎朝川沿いを歩いています。", textTranslation: "Every morning, I walk along the river.", tokens: [
    { surface: "毎朝", reading: "まいあさ" },
    { surface: "川沿い", reading: "かわぞい" },
    { surface: "を", reading: null },
    { surface: "歩いて", reading: "あるいて" },
    { surface: "います", reading: "います" },
    { surface: "。", reading: null },
  ] },
  { id: "d", idx: 3, tStartMs: 331_000, textOriginal: "空気がとても澄んでいて、気持ちがいいですね。", textTranslation: "The air is so clear — it feels wonderful.", tokens: [] },
  { id: "e", idx: 4, tStartMs: 338_000, textOriginal: "少し寒いですが、散歩には最適です。", textTranslation: "It's a bit cold, but it's perfect for a walk.", tokens: [] },
];

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Demo({ currentIdx = 2, furigana = false, translation = true }: { currentIdx?: number; furigana?: boolean; translation?: boolean }) {
  const [furi, setFuri] = useState(furigana);
  const [tr, setTr] = useState(translation);
  return (
    <div className="bg-bg-2" style={{ height: 480 }}>
      <PlayerTranscript
        lines={SAMPLE}
        currentLineIdx={currentIdx}
        showFurigana={furi}
        showTranslation={tr}
        onLineClick={() => undefined}
        onToggleFurigana={() => setFuri((x) => !x)}
        onToggleTranslation={() => setTr((x) => !x)}
        formatTimecode={fmt}
      />
    </div>
  );
}

const meta: Meta<typeof PlayerTranscript> = {
  title: "Player/Transcript",
  component: PlayerTranscript,
};
export default meta;
type Story = StoryObj<typeof PlayerTranscript>;

export const Default: Story = { render: () => <Demo /> };
export const WithFurigana: Story = { render: () => <Demo furigana /> };
export const Dark: Story = {
  render: () => (
    <div data-theme="dark">
      <Demo furigana />
    </div>
  ),
};
