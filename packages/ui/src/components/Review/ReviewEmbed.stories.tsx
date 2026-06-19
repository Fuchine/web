import type { Meta, StoryObj } from "@storybook/react";
import { ReviewEmbed } from "./ReviewEmbed";

const meta = {
  title: "Review/ReviewEmbed",
  component: ReviewEmbed,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ReviewEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    videoId: "dQw4w9WgXcQ",
    startMs: 5000,
    endMs: 15000,
  },
};
