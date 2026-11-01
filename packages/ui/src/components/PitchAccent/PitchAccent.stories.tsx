import type { Meta, StoryObj } from "@storybook/react";
import { PitchAccent } from "./PitchAccent";

const kanjium = (reading: string, ...positions: number[]) => [{ reading, positions, source: "kanjium" }];

const meta: Meta<typeof PitchAccent> = {
  title: "UI/PitchAccent",
  component: PitchAccent,
  args: { pitch: kanjium("はし", 0), size: "md" },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  decorators: [
    (Story) => (
      <div className="bg-surface p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PitchAccent>;

/** 端 はし [0] — low then high, a following particle stays high. */
export const Heiban: Story = { args: { pitch: kanjium("はし", 0) } };

/** 箸 はし [1] — drops right after the first mora. */
export const Atamadaka: Story = { args: { pitch: kanjium("はし", 1) } };

/** 日本 にほん [2] — rises, then drops inside the word. */
export const Nakadaka: Story = { args: { pitch: kanjium("にほん", 2) } };

/** 橋 はし [2] — high to the end, drops onto the particle. */
export const Odaka: Story = { args: { pitch: kanjium("はし", 2) } };

/** Small kana join their mora (きょ) and ー / っ count as morae. */
export const SmallKanaAndLongVowel: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <PitchAccent pitch={kanjium("きょう", 1)} size="md" />
      <PitchAccent pitch={kanjium("コーヒー", 3)} size="md" />
      <PitchAccent pitch={kanjium("がっこう", 0)} size="md" />
    </div>
  ),
};

/** Several accents for one word — all are shown (２つ ふたつ: 0 and 3). */
export const MultipleAccents: Story = { args: { pitch: kanjium("ふたつ", 0, 3) } };

/** The はし minimal triple side by side, small size (popup). */
export const HashiTriple: Story = {
  render: () => (
    <div className="flex gap-8">
      <PitchAccent pitch={kanjium("はし", 1)} />
      <PitchAccent pitch={kanjium("はし", 2)} />
      <PitchAccent pitch={kanjium("はし", 0)} />
    </div>
  ),
};

export const Dark: Story = {
  args: { pitch: kanjium("にほん", 2) },
  decorators: [
    (Story) => (
      <div data-theme="dark" className="bg-surface p-6">
        <Story />
      </div>
    ),
  ],
};
