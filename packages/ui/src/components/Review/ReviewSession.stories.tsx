import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ReviewSession, type ReviewItem } from "./ReviewSession";

const now = new Date();
const later = (mins: number) => new Date(now.getTime() + mins * 60000);

const mockQueue: ReviewItem[] = [
  {
    cardId: "card-1",
    videoId: "vid-abc",
    cardType: "sentence",
    notes: null,
    due: later(0),
    clip: { source: "youtube", sourceId: "dQw4w9WgXcQ", startMs: 5000, endMs: 8000 },
    sentence: {
      text: "雨が降っている",
      translation: "It is raining",
    },
    intervals: {
      "1": later(1),
      "2": later(10),
      "3": later(60),
      "4": later(1440),
    },
  },
  {
    cardId: "card-2",
    videoId: "vid-abc",
    cardType: "sentence",
    notes: null,
    due: later(0),
    clip: { source: "youtube", sourceId: "dQw4w9WgXcQ", startMs: 15000, endMs: 18000 },
    sentence: {
      text: "私は日本語を勉強している",
      translation: "I am studying Japanese",
    },
    intervals: {
      "1": later(1),
      "2": later(5),
      "3": later(30),
      "4": later(720),
    },
  },
  {
    cardId: "card-3",
    videoId: "vid-xyz",
    cardType: "sentence",
    notes: null,
    due: later(0),
    clip: { source: "youtube", sourceId: "xyz123", startMs: 30000, endMs: 33000 },
    sentence: {
      text: "猫が窓の外を見ている",
      translation: "The cat is looking outside the window",
    },
    intervals: {
      "1": later(1),
      "2": later(15),
      "3": later(120),
      "4": later(2880),
    },
  },
];

function Wrapper({ queue }: { queue: ReviewItem[] }) {
  const [done, setDone] = useState(false);
  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      <ReviewSession queue={queue} onComplete={() => setDone(true)} />
      {done && <p className="text-white text-center mt-8">Session complete!</p>}
    </div>
  );
}

const meta: Meta<typeof ReviewSession> = {
  component: ReviewSession,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof ReviewSession>;

export const Default: Story = {
  render: () => <Wrapper queue={mockQueue} />,
};

export const EmptyQueue: Story = {
  render: () => {
    const [called, setCalled] = useState(false);
    return (
      <div className="p-8 bg-gray-950 min-h-screen">
        <ReviewSession
          queue={[]}
          onComplete={() => setCalled(true)}
        />
        {called && <p className="text-white text-center mt-8">onComplete was called!</p>}
      </div>
    );
  },
};