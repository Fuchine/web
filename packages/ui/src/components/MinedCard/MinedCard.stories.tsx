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

// autoDismissMs: 0 keeps the toast on screen in Storybook (it auto-dismisses
// after MINED_TOAST_MS in the Player).
export const Created: Story = {
  args: { ...BASE_ARGS, autoDismissMs: 0 },
};

/** T3.6: "Rewatch ×2" replays the mined clip without leaving the video. */
export const WithRewatch: Story = {
  args: { ...BASE_ARGS, onRewatch: () => {}, autoDismissMs: 0 },
};

export const Rewatching: Story = {
  args: { ...BASE_ARGS, onRewatch: () => {}, rewatching: true },
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
