import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
  args: { padding: "md", interactive: false, muted: false },
  argTypes: { padding: { control: "inline-radio", options: ["none", "sm", "md", "lg"] } },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Today's reviews</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>23 cards due</div>
      </div>
    ),
  },
};

export const Muted: Story = { args: { muted: true, children: "Faint warm panel" } };

export const Interactive: Story = {
  args: { interactive: true, children: "Hover me — lifts with a calm shadow" },
};
