import type { Meta, StoryObj } from "@storybook/react";
import { ReviewSource } from "./ReviewSource";

const meta = {
  title: "Review/ReviewSource",
  component: ReviewSource,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ReviewSource>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    channel: "Kyoto Slow Living",
    title: "京都の朝、静かな散歩",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    onPlayClip: () => console.log("Play clip clicked"),
  },
};
