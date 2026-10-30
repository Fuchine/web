import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { CurateCard, type CurateCardProps } from "./CurateCard";

const BASE: CurateCardProps = {
  sentence: { text: "毎朝川沿いを歩いています。", translation: "Every morning, I walk along the river." },
  tokens: [
    { surface: "毎朝", reading: "まいあさ", wordEntryId: "w1" },
    { surface: "川沿い", reading: "かわぞい", wordEntryId: "w2" },
    { surface: "を", reading: "を", wordEntryId: null },
    { surface: "歩いて", reading: "あるいて", wordEntryId: "w3" },
    { surface: "います", reading: "います", wordEntryId: null },
    { surface: "。", reading: null, wordEntryId: null },
  ],
  wordEntries: {
    w1: { lemma: "毎朝", reading: "まいあさ", pos: "noun", frequencyRank: 2500, definitions: [{ glosses: ["every morning"], partsOfSpeech: ["noun"] }] },
    w2: { lemma: "川沿い", reading: "かわぞい", pos: "noun", frequencyRank: 18000, definitions: [{ glosses: ["along the river", "riverside"], partsOfSpeech: ["noun"] }] },
    w3: { lemma: "歩く", reading: "あるく", pos: "verb", frequencyRank: 900, definitions: [{ glosses: ["to walk"], partsOfSpeech: ["verb"] }] },
  },
  explanation: {
    plainTerms: "Every morning I'm out walking along the river — a habit, not a one-off.",
    breakdown: [
      { surface: "毎朝", tag: "noun", gloss: "every morning", note: "Time word; no particle needed." },
      { surface: "歩いています", tag: "verb", gloss: "am walking", note: "て-form + いる for a habitual action.", accent: true },
    ],
  },
  time: "5:24",
  notes: "",
  onNotesChange: () => {},
  onReplay: () => {},
  onDelete: () => {},
  onDone: () => {},
};

function Stateful(props: Partial<CurateCardProps>) {
  const [notes, setNotes] = useState(props.notes ?? "");
  return <CurateCard {...BASE} {...props} notes={notes} onNotesChange={setNotes} />;
}

const meta: Meta<typeof CurateCard> = {
  title: "UI/CurateCard",
  component: CurateCard,
  decorators: [
    (Story) => (
      <div className="max-w-[720px] bg-bg p-8 pt-48">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CurateCard>;

export const Default: Story = { render: () => <Stateful /> };

export const Active: Story = { render: () => <Stateful active /> };

export const NoExplanationNoTranslation: Story = {
  render: () => <Stateful explanation={null} sentence={{ text: BASE.sentence.text, translation: null }} />,
};

export const WithNotes: Story = { render: () => <Stateful notes="歩いています = habitual て-いる" /> };

export const Saving: Story = { render: () => <Stateful status="saving" notes="x" /> };

export const SaveError: Story = { render: () => <Stateful status="error" error="Could not save — try again." /> };

export const NotesOverLimit: Story = { render: () => <Stateful notes={"あ".repeat(2010)} /> };

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark" className="max-w-[720px] bg-bg p-8 pt-48">
        <Story />
      </div>
    ),
  ],
  render: () => <Stateful active />,
};
