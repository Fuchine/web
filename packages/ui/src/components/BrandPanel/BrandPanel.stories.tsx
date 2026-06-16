import type { Meta, StoryObj } from "@storybook/react";
import { BrandPanel } from "./BrandPanel";

const meta: Meta<typeof BrandPanel> = {
  title: "Composed/BrandPanel",
  component: BrandPanel,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div style={{ width: 520, height: 620, borderRadius: 12, overflow: "hidden" }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoCaption: Story = { args: { caption: null } };
