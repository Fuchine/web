import type { Meta, StoryObj } from "@storybook/react";
import { PlayerTopBar } from "./PlayerTopBar";

const meta: Meta<typeof PlayerTopBar> = {
  title: "Player/TopBar",
  component: PlayerTopBar,
  decorators: [(Story) => <div className="bg-bg"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof PlayerTopBar>;

export const Default: Story = {
  args: {
    title: "京都の朝、静かな散歩 — A quiet morning walk in Kyoto",
    channel: "Kyoto Slow Living",
    onBack: () => undefined,
  },
};

export const Dark: Story = {
  args: { title: "京都の朝、静かな散歩", channel: "Kyoto Slow Living", onBack: () => undefined },
  decorators: [(Story) => <div data-theme="dark" className="bg-bg"><Story /></div>],
};
