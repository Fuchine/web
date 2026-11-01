import type { Meta, StoryObj } from "@storybook/react";
import { ShadowCard } from "./ShadowCard";
import type { VoiceRecorder } from "./useVoiceRecorder";
import type { RecorderStatus } from "./recorder";

const fake = (status: RecorderStatus, over: Partial<VoiceRecorder> = {}): VoiceRecorder => ({
  status,
  url: null,
  elapsedMs: 0,
  start: async () => {},
  stop: () => {},
  discard: () => {},
  ...over,
});

const meta = {
  title: "Review/ShadowCard",
  component: ShadowCard,
  parameters: { layout: "padded" },
  args: {
    clip: { sourceId: "dQw4w9WgXcQ", startMs: 45000, endMs: 48500 },
    sentence: { text: "毎朝川沿いを歩いています。", translation: "Every morning, I walk along the river." },
    target: { surface: "歩い", reading: "あるい", lemma: "歩く", meanings: ["to walk"] },
    source: {
      channel: "Kyoto Slow Living",
      videoTitle: "京都の朝、静かな散歩",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    },
    notes: null,
    autoplay: false,
  },
} satisfies Meta<typeof ShadowCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Real recorder: asks for the mic on "Record"; the take stays in memory. */
export const Live: Story = {};

export const Recording: Story = { args: { recorder: fake("recording", { elapsedMs: 4200 }) } };

/** A take exists (silent placeholder URL): B and A/B are enabled. */
export const WithTake: Story = {
  args: { recorder: fake("ready", { url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=" }) },
};

export const MicDenied: Story = { args: { recorder: fake("denied") } };

export const NoMicrophone: Story = { args: { recorder: fake("no-device") } };

export const Unsupported: Story = { args: { recorder: fake("unsupported") } };
