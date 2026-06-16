import type { Meta, StoryObj } from "@storybook/react";
import { SectionHeading } from "./SectionHeading";

const meta: Meta<typeof SectionHeading> = {
  title: "Primitives/SectionHeading",
  component: SectionHeading,
  args: { children: "Continue watching" },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    children: "Most comprehensible",
    action: <a className="text-[13px] font-medium text-link" href="#">See all</a>,
  },
};
