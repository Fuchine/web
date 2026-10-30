import type { Meta, StoryObj } from "@storybook/react";
import { DictPopup } from "../DictPopup/DictPopup";
import { TokenFixEditor, type FixEntryHit, type FixToken, type TokenFixEditorProps } from "./TokenFixEditor";

// マー|ク (a name split at ー), then さん.
const NAME_SPLIT: FixToken[] = [
  { surface: "マー", lemma: "マー", reading: "まー", pos: "名詞", wordEntryId: null },
  { surface: "ク", lemma: "ク", reading: "く", pos: "名詞", wordEntryId: null },
  { surface: "さん", lemma: "さん", reading: "さん", pos: "名詞", wordEntryId: "w-san" },
];

// 大きく read おうきく (wrong furigana).
const WRONG_READING: FixToken[] = [
  { surface: "大きく", lemma: "大きい", reading: "おうきく", pos: "形容詞", wordEntryId: "w-ookii" },
  { surface: "なる", lemma: "なる", reading: "なる", pos: "動詞", wordEntryId: "w-naru" },
];

// 1|0分 (a split counter, losing じゅっぷん).
const COUNTER: FixToken[] = [
  { surface: "1", lemma: "1", reading: "いち", pos: "名詞", wordEntryId: null },
  { surface: "0分", lemma: "0分", reading: "ぜろふん", pos: "名詞", wordEntryId: null },
  { surface: "待つ", lemma: "待つ", reading: "まつ", pos: "動詞", wordEntryId: "w-matsu" },
];

const HITS: FixEntryHit[] = [
  { id: "w-mark", lemma: "マーク", reading: "まーく", gloss: "mark; symbol" },
  { id: "w-mark2", lemma: "マーク", reading: "まーく", gloss: "Mark (given name)" },
];

const BASE: TokenFixEditorProps = {
  tokens: NAME_SPLIT,
  index: 0,
  onSave: (o) => console.log("save", o),
  onReset: (s) => console.log("reset", s),
  onSearch: async () => HITS,
  onCancel: () => {},
};

const meta: Meta<typeof TokenFixEditor> = {
  title: "UI/TokenFixEditor",
  component: TokenFixEditor,
  decorators: [
    (Story) => (
      <div className="relative bg-bg" style={{ width: 420, height: 640 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TokenFixEditor>;

/** Inside the dictionary popup, as the player and curation screen show it. */
function InPopup(props: Partial<TokenFixEditorProps>) {
  return (
    <DictPopup
      position={{ left: 40, bottom: 20, arrowLeft: 60, w: 324 }}
      entry={null}
      loading={false}
      error={null}
      saved={false}
      onExplain={() => {}}
      onSaveWord={() => {}}
      onClose={() => {}}
      fixEditor={<TokenFixEditor {...BASE} {...props} />}
    />
  );
}

/** マー|ク: "Merge with next", then pick マーク or mark it as a name. */
export const MergeName: Story = { render: () => <InPopup /> };

/** 大きく おうきく → type おおきく; the current entry is kept. */
export const ReadingFix: Story = { render: () => <InPopup tokens={WRONG_READING} index={0} /> };

/** 1|0分: merge, then read じゅっぷん. */
export const Counter: Story = { render: () => <InPopup tokens={COUNTER} index={0} /> };

/** A saved correction: "Corrected by you" + Reset. */
export const Corrected: Story = {
  render: () => (
    <InPopup
      tokens={[
        { surface: "マーク", lemma: "マーク", reading: "まーく", pos: "固有名詞", wordEntryId: null },
        NAME_SPLIT[2]!,
      ]}
      spans={[
        { start: 0, end: 1, corrected: true },
        { start: 2, end: 2, corrected: false },
      ]}
      index={0}
    />
  ),
};

export const Saving: Story = { render: () => <InPopup busy /> };

export const ServerError: Story = {
  render: () => <InPopup error='surfaces must spell exactly "マーク" (the line text cannot change)' />,
};

/** Without a search callback the picker offers only auto / keep / name. */
export const NoSearch: Story = { render: () => <InPopup onSearch={undefined} /> };

export const Dark: Story = {
  decorators: [
    (S) => (
      <div data-theme="dark" className="relative bg-bg" style={{ width: 420, height: 640 }}>
        <S />
      </div>
    ),
  ],
  render: () => <InPopup tokens={WRONG_READING} index={0} />,
};
