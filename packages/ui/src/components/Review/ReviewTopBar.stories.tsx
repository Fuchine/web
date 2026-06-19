import type { Meta, StoryObj } from "@storybook/react";
import { ReviewTopBar } from "./ReviewTopBar";

const meta: Meta<typeof ReviewTopBar> = {
  title: "fuchine/Review/ReviewTopBar",
  component: ReviewTopBar,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ReviewTopBar>;

export const Default: Story = {
  args: {
    current: 3,
    total: 17,
    againCount: 3,
    learnCount: 5,
    dueCount: 16,
    onExit: () => console.log("exit"),
  },
};
