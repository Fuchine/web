import type { Meta, StoryObj } from "@storybook/react";
import { ListenRevealCard } from "./ListenRevealCard";

const meta = {
  title: "Review/ListenRevealCard",
  component: ListenRevealCard,
  parameters: { layout: "padded" },
  args: {
    step: "listen",
    sentence: { text: "毎朝川沿いを歩いています。", translation: "Every morning, I walk along the river." },
    target: { surface: "歩い", reading: "あるい", lemma: "歩く", meanings: ["to walk", "to go on foot"] },
    source: {
      channel: "Kyoto Slow Living",
      videoTitle: "京都の朝、静かな散歩",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    },
    notes: null,
    onPlayClip: () => {},
    onEditNotes: () => {},
  },
} satisfies Meta<typeof ListenRevealCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 1 — audio only: nothing to read yet. */
export const Listen: Story = {};

/** Step 2 — the Japanese appears; the translation is still hidden. */
export const Text: Story = { args: { step: "text" } };

/** Step 3 — translation and word details; the grade buttons show in the dock. */
export const Answer: Story = { args: { step: "answer" } };

/** A line imported before translation finished still works. */
export const AnswerWithoutTranslation: Story = {
  args: { step: "answer", sentence: { text: "毎朝川沿いを歩いています。", translation: null } },
};
