import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PitchAccent, type PitchInfo } from "./PitchAccent";

// Text-node separators (<!-- -->) stripped so assertions read like the UI.
const render = (pitch: PitchInfo[] | null) =>
  renderToStaticMarkup(createElement(PitchAccent, { pitch })).replaceAll("<!-- -->", "");

describe("PitchAccent", () => {
  it("renders the category, downstep and the source credit", () => {
    const html = render([{ reading: "にほん", positions: [2], source: "kanjium" }]);
    expect(html).toContain('data-category="nakadaka"');
    expect(html).toContain("Nakadaka");
    expect(html).toContain("中高");
    expect(html).toContain("[2]");
    expect(html).toContain("Pitch: Kanjium");
  });

  it("one row per accent, the source credited once", () => {
    const html = render([{ reading: "ふたつ", positions: [0, 3], source: "kanjium" }]);
    expect(html).toContain('data-category="heiban"');
    expect(html).toContain('data-category="odaka"');
    expect(html.match(/Pitch: /g)).toHaveLength(1);
  });

  it("renders nothing without data or with no position that fits", () => {
    expect(render(null)).toBe("");
    expect(render([])).toBe("");
    expect(render([{ reading: "はし", positions: [7], source: "kanjium" }])).toBe("");
  });
});
