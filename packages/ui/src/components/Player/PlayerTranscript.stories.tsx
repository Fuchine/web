import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlayerTranscript, type TranscriptLine } from "./PlayerTranscript";
import { FURIGANA_MODES, nextInCycle, type FuriganaMode, type WordStatus } from "../../lib/listening";

const SAMPLE: TranscriptLine[] = [
  { id: "a", idx: 0, tStartMs: 312_000, textOriginal: "おはようございます。", textTranslation: "Good morning.", tokens: [] },
  { id: "b", idx: 1, tStartMs: 316_000, textOriginal: "今日は京都の鴨川に来ています。", textTranslation: "Today I'm here at the Kamo River in Kyoto.", tokens: [] },
  { id: "c", idx: 2, tStartMs: 324_000, textOriginal: "毎朝川沿いを歩いています。", textTranslation: "Every morning, I walk along the river.", tokens: [
    { surface: "毎朝", reading: "まいあさ", romaji: "maiasa", wordEntryId: "w1", pos: "Noun" },
    { surface: "川沿い", reading: "かわぞい", romaji: "kawazoi", wordEntryId: "w2", pos: "Noun" },
    { surface: "を", reading: null, romaji: "wo", wordEntryId: null, pos: "Particle" },
    { surface: "歩いて", reading: "あるいて", romaji: "aruite", wordEntryId: "w3", pos: "Verb" },
    { surface: "います", reading: "います", romaji: "imasu", wordEntryId: "w4", pos: "Aux" },
    { surface: "。", reading: null, romaji: null, wordEntryId: null, pos: "Punct" },
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

// 毎朝 known, 歩いて seen, 川沿い unknown.
const STATUSES: Record<string, WordStatus> = { w1: "known", w3: "seen" };

// i+1 (T3.10): line c has exactly one unknown word, 川沿い (token 1).
const WITH_IP1 = SAMPLE.map((l) => (l.id === "c" ? { ...l, iPlusOneIdx: 1 } : l));

function Demo({ currentIdx = 2, furigana = "off", translation = true, colorKnown = false, iPlusOne = false }: {
  currentIdx?: number;
  furigana?: FuriganaMode;
  translation?: boolean;
  colorKnown?: boolean;
  iPlusOne?: boolean;
}) {
  const [furi, setFuri] = useState<FuriganaMode>(furigana);
  const [tr, setTr] = useState(translation);
  const [color, setColor] = useState(colorKnown);
  const [only, setOnly] = useState(false);
  const [mined, setMined] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <div className="bg-bg-2" style={{ height: 480 }}>
      <PlayerTranscript
        lines={iPlusOne ? WITH_IP1 : SAMPLE}
        currentLineIdx={currentIdx}
        furigana={furi}
        wordStatuses={STATUSES}
        colorKnown={color}
        showTranslation={tr}
        onLineClick={() => undefined}
        onCycleFurigana={() => setFuri((x) => nextInCycle(FURIGANA_MODES, x))}
        onToggleColorKnown={() => setColor((x) => !x)}
        onToggleTranslation={() => setTr((x) => !x)}
        onlyIPlusOne={only}
        onToggleIPlusOne={iPlusOne ? () => setOnly((x) => !x) : undefined}
        onMineLine={iPlusOne ? (idx) => setMined((m) => new Set(m).add(SAMPLE[idx]!.id)) : undefined}
        minedLineIds={mined}
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
export const WithFurigana: Story = { render: () => <Demo furigana="all" /> };
/** Known-word coloring on (hover the dotted-A tool for the legend). */
export const KnownWordColors: Story = { render: () => <Demo colorKnown /> };
/** Furigana only over words not yet known: 毎朝 (known) has none. */
export const FuriganaUnknownOnly: Story = { render: () => <Demo furigana="unknown" colorKnown /> };
/** i+1 lines: marker, dotted target word, "Show i+1 lines" filter and "Mine this i+1 line". */
export const IPlusOne: Story = { render: () => <Demo iPlusOne colorKnown /> };
export const Dark: Story = {
  render: () => (
    <div data-theme="dark">
      <Demo furigana="all" colorKnown />
    </div>
  ),
};
