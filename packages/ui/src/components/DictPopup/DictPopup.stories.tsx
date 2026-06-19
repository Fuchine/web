import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DictPopup, type DictPopupProps } from "./DictPopup";

const ENTRY = {
  word: "歩く",
  reading: "あるく",
  pos: "Godan verb · intransitive",
  frequencyRank: 5,
  definitions: [
    {
      glosses: ["to walk", "to go on foot"],
      partsOfSpeech: ["verb"],
      tags: ["common"],
    },
    {
      glosses: [
        "to go (somewhere) step by step",
        "to make one's way",
      ],
      partsOfSpeech: ["verb"],
      tags: ["figurative"],
    },
  ],
  lemma: { word: "歩く", reading: "あるく" },
};

const POSITION = { left: 120, bottom: 80, arrowLeft: 180, w: 324 };

const meta: Meta<typeof DictPopup> = {
  title: "UI/DictPopup",
  component: DictPopup,
  decorators: [
    (Story) => (
      <div className="relative bg-bg" style={{ height: 320 }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DictPopup>;

export const Default: Story = {
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Saved: Story = {
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: true,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Loading: Story = {
  args: {
    position: POSITION,
    entry: null,
    loading: true,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Error: Story = {
  args: {
    position: POSITION,
    entry: null,
    loading: false,
    error: "Could not load definition.",
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const NoLemma: Story = {
  args: {
    position: POSITION,
    entry: { ...ENTRY, lemma: undefined },
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div data-theme="dark" className="relative bg-bg" style={{ height: 320 }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    position: POSITION,
    entry: ENTRY,
    loading: false,
    error: null,
    saved: false,
    onExplain: () => {},
    onSaveWord: () => {},
    onClose: () => {},
  } as DictPopupProps,
};
