import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DictPopup } from "../DictPopup/DictPopup";
import { TokenFixEditor, type FixToken } from "./TokenFixEditor";

const TOKENS: FixToken[] = [
  { surface: "マー", lemma: "マー", reading: "まー", pos: "名詞", wordEntryId: null },
  { surface: "ク", lemma: "ク", reading: "く", pos: "名詞", wordEntryId: null },
];
const noop = () => {};

const editor = (extra: Partial<Parameters<typeof TokenFixEditor>[0]> = {}) =>
  renderToStaticMarkup(createElement(TokenFixEditor, {
    tokens: TOKENS, index: 0, onSave: noop, onReset: noop, onCancel: noop, ...extra,
  }));

describe("TokenFixEditor", () => {
  it("offers boundaries, reading, entry choice and save", () => {
    const html = editor();
    expect(html).toContain("Merge with next");
    expect(html).toContain("Split after マ");
    expect(html).toContain("Reading (hiragana)");
    expect(html).toContain("Not a dictionary word (name)");
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Corrected by you");
    expect(html).not.toContain(">Reset<");
    // First token: nothing to merge with on the left.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Merge with previous/);
  });

  it("shows the correction badge and Reset on a corrected token", () => {
    const html = editor({
      tokens: [{ surface: "マーク", lemma: "マーク", reading: "まーく", pos: "固有名詞", wordEntryId: null }],
      spans: [{ start: 0, end: 1, corrected: true }],
    });
    expect(html).toContain("Corrected by you");
    expect(html).toContain(">Reset<");
  });

  it("renders the search box only with a search callback", () => {
    expect(editor()).not.toContain("Search the dictionary");
    expect(editor({ onSearch: async () => [] })).toContain("Search the dictionary");
  });
});

describe("DictPopup Fix action", () => {
  const base = {
    position: { left: 0, bottom: 0, arrowLeft: 0, w: 324 },
    loading: false, saved: false, onExplain: noop, onSaveWord: noop, onClose: noop,
  };

  it("shows Fix on an entry and on a token without one", () => {
    const entry = { word: "歩く", reading: "あるく", pos: null, frequencyRank: null, definitions: [] };
    expect(renderToStaticMarkup(createElement(DictPopup, { ...base, entry, error: null, onFix: noop }))).toContain("Fix");
    const none = renderToStaticMarkup(createElement(DictPopup, { ...base, entry: null, error: "No dictionary entry.", onFix: noop }));
    expect(none).toContain("No dictionary entry.");
    expect(none).toContain("Fix");
  });

  it("hides Fix without the callback", () => {
    const html = renderToStaticMarkup(createElement(DictPopup, { ...base, entry: null, error: "No dictionary entry." }));
    expect(html).not.toContain("Fix");
  });
});
