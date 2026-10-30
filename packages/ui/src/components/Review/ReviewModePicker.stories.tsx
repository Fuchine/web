import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ReviewModePicker } from "./ReviewModePicker";
import type { ReviewMode } from "./review-modes";

const meta = {
  title: "Review/ReviewModePicker",
  component: ReviewModePicker,
  parameters: { layout: "padded" },
  args: { mode: "classic", onChange: () => {} },
} satisfies Meta<typeof ReviewModePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: (args) => {
    const [mode, setMode] = useState<ReviewMode>(args.mode);
    return <ReviewModePicker mode={mode} onChange={setMode} />;
  },
};

export const Shadow: Story = { args: { mode: "shadow" } };
