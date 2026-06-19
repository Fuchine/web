import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Primitives/Skeleton",
  component: Skeleton,
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Video: Story = { args: { ratio: "video" } };
export const Circle: Story = { args: { ratio: "circle" } };
export const NoAnimation: Story = { args: { animation: "none" } };
