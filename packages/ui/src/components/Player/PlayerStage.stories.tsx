import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PlayerStage, type PlayerVideoHandle } from "./PlayerStage";
import { RATES, type PlaybackRate } from "./PlayerControlBar";
import type { FocalLine } from "./PlayerFocalSubtitles";

const FOCAL: FocalLine = {
  id: "c",
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

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Demo() {
  const [handle, setHandle] = useState<PlayerVideoHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(1.0);
  const [loop, setLoop] = useState(false);
  const [ms, setMs] = useState(5 * 60 * 1000 + 24 * 1000);
  const [tr, setTr] = useState(true);
  const [furi, setFuri] = useState(false);
  return (
    <div className="bg-bg" style={{ padding: 24 }}>
      <PlayerStage
        videoId="dQw4w9WgXcQ"
        startAt={0}
        focalLine={FOCAL}
        showTranslation={tr}
        showFurigana={furi}
        onReady={(h) => setHandle(h)}
        onStateChange={(s) => setPlaying(s === "playing")}
        onError={() => undefined}
        controlBar={{
          isPlaying: playing,
          currentMs: ms,
          durationMs: 14 * 60 * 1000 + 22 * 1000,
          playbackRate: rate,
          loopLine: loop,
          formatTimecode: fmt,
          onPlayPause: () => (playing ? handle?.pause() : handle?.play()),
          onSkip: (d) => handle && setMs((m) => Math.max(0, Math.min(862_000, m + d))),
          onSeek: (target) => handle?.seekTo(target / 1000),
          onToggleLoop: () => setLoop((l) => !l),
          onToggleTranslation: () => setTr((t) => !t),
          onCycleRate: () => {
            const i = RATES.indexOf(rate);
            const next = RATES[(i + 1) % RATES.length]!;
            setRate(next);
            handle?.setPlaybackRate(next);
          },
        }}
      />
    </div>
  );
}

const meta: Meta<typeof PlayerStage> = {
  title: "Player/Stage",
  component: PlayerStage,
};
export default meta;
type Story = StoryObj<typeof PlayerStage>;

export const Default: Story = { render: () => <Demo /> };
export const Dark: Story = {
  render: () => (
    <div data-theme="dark" className="bg-bg" style={{ padding: 24 }}>
      <Demo />
    </div>
  ),
};
