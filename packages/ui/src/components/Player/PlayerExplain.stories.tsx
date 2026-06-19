import type { Meta, StoryObj } from "@storybook/react";
import type { Explanation } from "@fuchine/db";
import { PlayerExplain, type ExplainFocal } from "./PlayerExplain";

const FOCAL: ExplainFocal = {
  textOriginal: "毎朝川沿いを歩いています。",
  textTranslation: "Every morning, I walk along the river.",
  focusSurface: null,
};

const EXPLANATION: Explanation = {
  breakdown: [
    { surface: "毎朝", tag: "adverb", gloss: "every morning", note: "Adverb of time — sets when the action happens." },
    { surface: "川沿い", tag: "noun", gloss: "riverside", note: "The place; literally \"river-side\"." },
    { surface: "を", tag: "particle", accent: true, gloss: "path marker", note: "With a motion verb, を marks the route travelled — not a direct object." },
    { surface: "歩いて います", tag: "grammar", accent: true, gloss: "~ている form", note: "Te-form + いる expresses an ongoing or habitual action: \"(I) walk / am walking\"." },
  ],
  plainTerms:
    "Paired with 毎朝, 〜ています reads as a habit rather than a one-off — the natural way to say something you do regularly. And を after 川沿い is the giveaway: with 歩く it marks the path covered, so you walk along the river, not \"walk the river\" as an object.",
};

function Demo(props: Partial<React.ComponentProps<typeof PlayerExplain>>) {
  return (
    <div className="player-page" data-theme="light" style={{ height: 560, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, background: "var(--bg-2)" }}>
        <PlayerExplain
          focal={FOCAL}
          explanation={null}
          loading={false}
          error={null}
          onRegenerate={() => undefined}
          {...props}
        />
      </div>
    </div>
  );
}

const meta: Meta<typeof PlayerExplain> = {
  title: "Player/Explain",
  component: PlayerExplain,
};
export default meta;
type Story = StoryObj<typeof PlayerExplain>;

export const Loaded: Story = {
  render: () => <Demo explanation={EXPLANATION} />,
};

export const Loading: Story = {
  render: () => <Demo loading />,
};

export const ErrorState: Story = {
  render: () => <Demo error="Could not generate an explanation right now." />,
};

export const Empty: Story = {
  render: () => <Demo focal={null} />,
};
