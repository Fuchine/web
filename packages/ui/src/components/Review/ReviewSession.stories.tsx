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
    state: 2,
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
    tokens: [
      { surface: "雨", lemma: "雨", reading: "あめ", pos: "noun", wordEntryId: "we-ame" },
      { surface: "が", lemma: "が", reading: "が", pos: "particle", wordEntryId: null },
      { surface: "降って", lemma: "降る", reading: "ふる", pos: "verb", wordEntryId: "we-furu" },
      { surface: "いる", lemma: "いる", reading: "いる", pos: "verb", wordEntryId: "we-iru" },
    ],
    wordEntriesMap: {
      "we-ame": { reading: "あめ", lemma: "雨", definitions: [{ glosses: ["rain"] }], pos: "noun" },
      "we-furu": { reading: "ふる", lemma: "降る", definitions: [{ glosses: ["to fall", "to precipitate"] }], pos: "verb" },
      "we-iru": { reading: "いる", lemma: "いる", definitions: [{ glosses: ["to be (continuous)"] }], pos: "verb" },
    },
  },
  {
    cardId: "card-2",
    videoId: "vid-abc",
    cardType: "sentence",
    notes: null,
    due: later(0),
    state: 1,
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
    tokens: [
      { surface: "私", lemma: "私", reading: "わたし", pos: "noun", wordEntryId: "we-watashi" },
      { surface: "は", lemma: "は", reading: "は", pos: "particle", wordEntryId: null },
      { surface: "日本語", lemma: "日本語", reading: "にほんご", pos: "noun", wordEntryId: "we-nihongo" },
      { surface: "を", lemma: "を", reading: "を", pos: "particle", wordEntryId: null },
      { surface: "勉強して", lemma: "勉強する", reading: "べんきょうする", pos: "verb", wordEntryId: "we-benkyou" },
      { surface: "いる", lemma: "いる", reading: "いる", pos: "verb", wordEntryId: "we-iru" },
    ],
    wordEntriesMap: {
      "we-watashi": { reading: "わたし", lemma: "私", definitions: [{ glosses: ["I", "me"] }], pos: "noun" },
      "we-nihongo": { reading: "にほんご", lemma: "日本語", definitions: [{ glosses: ["Japanese (language)"] }], pos: "noun" },
      "we-benkyou": { reading: "べんきょうする", lemma: "勉強する", definitions: [{ glosses: ["to study"] }], pos: "verb" },
      "we-iru": { reading: "いる", lemma: "いる", definitions: [{ glosses: ["to be (continuous)"] }], pos: "verb" },
    },
  },
  {
    cardId: "card-3",
    videoId: "vid-xyz",
    cardType: "sentence",
    notes: null,
    due: later(0),
    state: 3,
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
    tokens: [
      { surface: "猫", lemma: "猫", reading: "ねこ", pos: "noun", wordEntryId: "we-neko" },
      { surface: "が", lemma: "が", reading: "が", pos: "particle", wordEntryId: null },
      { surface: "窓", lemma: "窓", reading: "まど", pos: "noun", wordEntryId: "we-mado" },
      { surface: "の", lemma: "の", reading: "の", pos: "particle", wordEntryId: null },
      { surface: "外", lemma: "外", reading: "そと", pos: "noun", wordEntryId: "we-soto" },
      { surface: "を", lemma: "を", reading: "を", pos: "particle", wordEntryId: null },
      { surface: "見て", lemma: "見る", reading: "みる", pos: "verb", wordEntryId: "we-miru" },
      { surface: "いる", lemma: "いる", reading: "いる", pos: "verb", wordEntryId: "we-iru" },
    ],
    wordEntriesMap: {
      "we-neko": { reading: "ねこ", lemma: "猫", definitions: [{ glosses: ["cat"] }], pos: "noun" },
      "we-mado": { reading: "まど", lemma: "窓", definitions: [{ glosses: ["window"] }], pos: "noun" },
      "we-soto": { reading: "そと", lemma: "外", definitions: [{ glosses: ["outside"] }], pos: "noun" },
      "we-miru": { reading: "みる", lemma: "見る", definitions: [{ glosses: ["to look", "to see", "to watch"] }], pos: "verb" },
      "we-iru": { reading: "いる", lemma: "いる", definitions: [{ glosses: ["to be (continuous)"] }], pos: "verb" },
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