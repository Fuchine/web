import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./Avatar";

const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { name: "Gabriel Soares", size: 32 },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Initials: Story = { args: { name: undefined, initials: "藍" } };
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="A B" size={24} />
      <Avatar name="Gabriel Soares" size={32} />
      <Avatar name="Gabriel Soares" size={48} />
    </div>
  ),
};
