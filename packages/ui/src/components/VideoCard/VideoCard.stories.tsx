import type { Meta, StoryObj } from "@storybook/react";
import { VideoCard } from "./VideoCard";

const meta: Meta<typeof VideoCard> = {
  title: "Composed/VideoCard",
  component: VideoCard,
  args: {
    title: "日本語の自然な会話 — カフェでの注文",
    channel: "Nihongo Daily",
    durationLabel: "12:34",
    level: 3,
    comprehension: 64,
    tone: 1,
    comprehensionStyle: "ring",
    onOverflow: () => {},
  },
  argTypes: {
    comprehensionStyle: { control: "inline-radio", options: ["ring", "text"] },
    tone: { control: "inline-radio", options: [1, 2, 3, 4, 5, 6] },
  },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 268 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TextComprehension: Story = { args: { comprehensionStyle: "text", comprehension: 33, tone: 3 } };
export const InProgress: Story = { args: { progress: 42, tone: 2, comprehension: 51 } };

export const Grid: Story = {
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 580 }}><Story /></div>],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <VideoCard title="朝のニュース：天気予報" channel="NHK" durationLabel="8:12" level={5} comprehension={28} tone={2} onOverflow={() => {}} />
      <VideoCard title="ゲーム実況 — 初見プレイ" channel="ゲームちゃんねる" durationLabel="24:01" level={2} comprehension={71} tone={6} progress={63} onOverflow={() => {}} />
      <VideoCard title="料理 vlog：簡単な朝ごはん" channel="Hana Kitchen" durationLabel="6:45" level={3} comprehension={55} tone={4} comprehensionStyle="text" onOverflow={() => {}} />
      <VideoCard title="VTuber 雑談配信の切り抜き" channel="切り抜きch" durationLabel="3:30" level={4} comprehension={42} tone={5} onOverflow={() => {}} />
    </div>
  ),
};
