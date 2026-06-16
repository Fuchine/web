import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "Noun", variant: "indigo", dot: false, pill: false },
  argTypes: {
    variant: { control: "inline-radio", options: ["neutral", "indigo", "ok", "warning", "error"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tag: Story = {};

/** Part-of-speech and JLPT tags used in the dictionary popup and explanations. */
export const PartOfSpeechAndJlpt: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge variant="indigo">Noun</Badge>
      <Badge variant="indigo">Verb (godan)</Badge>
      <Badge variant="indigo">Particle</Badge>
      <Badge variant="neutral">N5</Badge>
      <Badge variant="neutral">N4</Badge>
      <Badge variant="neutral">N3</Badge>
    </div>
  ),
};

/** Phrase / video status pills with a leading dot. */
export const StatusPills: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge variant="indigo" dot pill>New</Badge>
      <Badge variant="warning" dot pill>Learning</Badge>
      <Badge variant="error" dot pill>Due</Badge>
      <Badge variant="ok" dot pill>Known</Badge>
    </div>
  ),
};
