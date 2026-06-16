import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Start studying",
    variant: "primary",
    size: "md",
    fullWidth: false,
    loading: false,
    disabled: false,
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "ghost", "quiet"] },
    size: { control: "inline-radio", options: ["md", "sm"] },
    icon: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Ghost: Story = { args: { variant: "ghost", children: "Try another video" } };

export const Quiet: Story = { args: { variant: "quiet", children: "Cancel" } };

export const WithIcon: Story = { args: { icon: <PlusIcon />, children: "Add video" } };

export const Loading: Story = { args: { loading: true, children: "Checking video…" } };

export const Disabled: Story = { args: { disabled: true } };

export const Small: Story = { args: { size: "sm", children: "Sign out" } };

export const FullWidth: Story = {
  args: { fullWidth: true },
  parameters: { layout: "padded" },
};

/** All variants and sizes together, for a quick scan. */
export const Gallery: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button variant="primary">Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="quiet">Quiet</Button>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button variant="primary" icon={<PlusIcon />}>Add video</Button>
        <Button variant="primary" loading>Loading</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <Button variant="ghost" size="sm">Small</Button>
      </div>
    </div>
  ),
};
