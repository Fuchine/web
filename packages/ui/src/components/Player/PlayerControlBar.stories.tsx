import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlayerControlBar, RATES, type PlaybackRate } from "./PlayerControlBar";

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Demo({ initialPlaying = false, initialRate = 1.0 as PlaybackRate, loop = false, translation = true }: {
  initialPlaying?: boolean;
  initialRate?: PlaybackRate;
  loop?: boolean;
  translation?: boolean;
}) {
  const [playing, setPlaying] = useState(initialPlaying);
  const [rate, setRate] = useState<PlaybackRate>(initialRate);
  const [loopLine, setLoop] = useState(loop);
  const [showTr, setShowTr] = useState(translation);
  const [ms, setMs] = useState(5 * 60 * 1000 + 24 * 1000);
  return (
    <div className="bg-bg p-6">
      <PlayerControlBar
        isPlaying={playing}
        currentMs={ms}
        durationMs={14 * 60 * 1000 + 22 * 1000}
        playbackRate={rate}
        loopLine={loopLine}
        showTranslation={showTr}
        onPlayPause={() => setPlaying((p) => !p)}
        onSkip={(d) => setMs((m) => Math.max(0, m + d))}
        onSeek={(target) => setMs(target)}
        onToggleLoop={() => setLoop((l) => !l)}
        onToggleTranslation={() => setShowTr((t) => !t)}
        onCycleRate={() => {
          const i = RATES.indexOf(rate);
          setRate(RATES[(i + 1) % RATES.length]!);
        }}
        formatTimecode={fmt}
      />
    </div>
  );
}

const meta: Meta<typeof PlayerControlBar> = {
  title: "Player/ControlBar",
  component: PlayerControlBar,
};
export default meta;
type Story = StoryObj<typeof PlayerControlBar>;

export const Default: Story = { render: () => <Demo /> };
export const Playing: Story = { render: () => <Demo initialPlaying /> };
export const LoopAndTranslationOn: Story = { render: () => <Demo loop translation initialPlaying /> };
export const Dark: Story = {
  render: () => (
    <div data-theme="dark">
      <Demo initialPlaying />
    </div>
  ),
};
