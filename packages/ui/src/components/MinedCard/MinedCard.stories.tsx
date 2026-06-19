import type { Meta, StoryObj } from "@storybook/react";
import { MinedCard, type MinedCardProps } from "./MinedCard";

const BASE_ARGS = {
  created: true,
  sentence: {
    text: "毎朝川沿いを歩いています。",
    translation: "Every morning, I walk along the river.",
  },
  target: { surface: "歩いて", reading: "あるいて" },
  video: { title: "京都の朝、静かな散歩", channel: "Kyoto Slow Living" },
  time: "5:24",
  onUndo: () => {},
  onViewDeck: () => {},
  onClose: () => {},
} satisfies MinedCardProps;

const meta: Meta<typeof MinedCard> = {
  title: "UI/MinedCard",
  component: MinedCard,
  decorators: [
    (Story) => (
      <div className="bg-bg p-8">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MinedCard>;

export const Created: Story = {
  args: BASE_ARGS,
};

export const AlreadyMined: Story = {
  args: { ...BASE_ARGS, created: false },
};

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark" className="bg-bg p-8">
        <Story />
      </div>
    ),
  ],
  args: BASE_ARGS,
};
