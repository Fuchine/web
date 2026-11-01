import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ClozeCard } from "./ClozeCard";
import { checkClozeAnswer, type ClozeTarget } from "./answer";

const TARGET: ClozeTarget = {
  surface: "勉強",
  reading: "べんきょう",
  lemma: "勉強",
  lemmaReading: "べんきょう",
  meanings: ["study"],
};

const SENTENCE = { text: "私は日本語を勉強している", translation: "I am studying Japanese" };
const SOURCE = {
  channel: "Nihongo Daily",
  videoTitle: "毎日の日本語",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
};

const meta = {
  title: "Review/ClozeCard",
  component: ClozeCard,
  parameters: { layout: "padded" },
  args: {
    sentence: SENTENCE,
    target: TARGET,
    result: null,
    source: SOURCE,
    notes: null,
    onSubmit: () => {},
    onPlayClip: () => {},
  },
} satisfies Meta<typeof ClozeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive: try 勉強, べんきょう or ベンキョウ — all accepted. */
export const Typing: Story = {
  render: (args) => {
    const [result, setResult] = useState<{ answer: string; correct: boolean } | null>(null);
    return (
      <ClozeCard
        {...args}
        result={result}
        onSubmit={(answer) => answer.trim() && setResult({ answer, correct: checkClozeAnswer(answer, args.target) })}
      />
    );
  },
};

export const Correct: Story = { args: { result: { answer: "べんきょう", correct: true } } };

export const Incorrect: Story = { args: { result: { answer: "べんきょ", correct: false } } };

/** "Show answer" without typing. */
export const GaveUp: Story = { args: { result: { answer: "", correct: false } } };
