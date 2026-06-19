import type { Meta, StoryObj } from "@storybook/react";
import { ReviewCard } from "./ReviewCard";

const TARGET = {
  surface: "歩い",
  reading: "あるいて",
  lemma: "歩く",
  meanings: ["to walk", "to go on foot"],
};

const SOURCE = {
  channel: "Kyoto Slow Living",
  videoTitle: "京都の朝、静かな散歩",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
};

const CLIP = { sourceId: "dQw4w9WgXcQ", startMs: 45000, endMs: 48500 };

const meta = {
  title: "Review/ReviewCard",
  component: ReviewCard,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ReviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuestionState: Story = {
  args: {
    sentence: {
      text: "毎朝川沿いを歩いています。",
      translation: "Every morning, I walk along the river.",
    },
    target: TARGET,
    revealed: false,
    clip: CLIP,
    source: SOURCE,
    notes: null,
    onPlayClip: () => console.log("Play clip clicked"),
  },
};

export const AnswerRevealed: Story = {
  args: {
    sentence: {
      text: "毎朝川沿いを歩いています。",
      translation: "Every morning, I walk along the river.",
    },
    target: TARGET,
    revealed: true,
    clip: CLIP,
    source: SOURCE,
    notes: "Some context about this sentence",
    onPlayClip: () => console.log("Play clip clicked"),
    onEditNotes: (notes: string) => console.log("Edit notes:", notes),
  },
};

export const NoTarget: Story = {
  args: {
    sentence: {
      text: "毎朝川沿いを歩いています。",
      translation: "Every morning, I walk along the river.",
    },
    target: null,
    revealed: false,
    clip: CLIP,
    source: SOURCE,
    notes: null,
    onPlayClip: () => console.log("Play clip clicked"),
  },
};
