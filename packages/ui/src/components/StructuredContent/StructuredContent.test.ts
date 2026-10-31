import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DictDefinitionView, StructuredContent } from "./StructuredContent";
import { DictFrequencyChips, DictSections } from "../DictSources/DictSources";

const render = (content: unknown) =>
  renderToStaticMarkup(createElement(StructuredContent, { content })).replaceAll("<!-- -->", "");

describe("StructuredContent", () => {
  it("renders whitelisted tags, ruby and safe links", () => {
    const html = render([
      { tag: "ol", content: [{ tag: "li", content: ["小さな", { tag: "ruby", content: ["獣", { tag: "rt", content: "けもの" }] }] }] },
      { tag: "a", href: "https://example.com/x", content: "source" },
      { tag: "br" },
      { tag: "table", content: { tag: "tr", content: { tag: "td", colSpan: 2, content: "c" } } },
    ]);
    expect(html).toContain('<ol class="sc-ol"><li class="sc-li">小さな<ruby class="sc-ruby">獣<rt class="sc-rt">けもの</rt></ruby></li></ol>');
    expect(html).toContain('<a class="sc-a" href="https://example.com/x" target="_blank" rel="noopener noreferrer nofollow">source</a>');
    expect(html).toContain("<br/>");
    expect(html).toContain('<td class="sc-td" colSpan="2">c</td>');
  });

  it("never emits script, event handlers, javascript: URLs, images or raw HTML", () => {
    const html = render([
      "<img src=x onerror=alert(1)>",
      { tag: "script", content: "alert(1)" },
      { tag: "a", href: "javascript:alert(1)", content: "x" },
      { tag: "img", path: "a.png", alt: "pic" },
      { tag: "span", onclick: "alert(1)", style: { color: "red", backgroundImage: "url(javascript:x)" }, content: "y" },
      { tag: "iframe", content: "z" },
    ]);
    expect(html.replace("&lt;img src=x onerror=alert(1)&gt;", "")).not.toMatch(/<script|<img|<iframe|onerror=|onclick|javascript:|color|url\(/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;"); // text stays text
    expect(html).toContain('<span class="sc-span">x</span>');
  });

  it("keeps only the style allowlist", () => {
    expect(render({ tag: "span", style: { fontWeight: "bold", fontSize: "40px", verticalAlign: "super" }, content: "b" }))
      .toBe('<div class="sc-root"><span style="font-weight:700;vertical-align:super" class="sc-span">b</span></div>');
  });

  it("renders plain-text definitions", () => {
    expect(renderToStaticMarkup(createElement(DictDefinitionView, { def: { type: "text", text: "a <b>" } })))
      .toBe('<div class="sc-root">a &lt;b&gt;</div>');
  });
});

describe("DictSections / DictFrequencyChips", () => {
  it("shows each dictionary with its monolingual badge, in the given order", () => {
    const html = renderToStaticMarkup(
      createElement(DictSections, {
        sections: [
          { dictionaryId: "b", title: "Second", monolingual: true, entries: [{ expression: "猫", reading: "ねこ", tags: [], definitions: [{ type: "text", text: "ねこ。" }] }] },
          { dictionaryId: "a", title: "First", monolingual: false, entries: [{ expression: "猫", reading: "ねこ", tags: ["n"], definitions: [{ type: "text", text: "cat" }] }] },
          { dictionaryId: "c", title: "Empty", monolingual: false, entries: [] },
        ],
      }),
    );
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("First"));
    expect(html).toContain("Monolingual");
    expect(html).not.toContain("Empty");
  });
  it("shows the display value of a rank, or the rank", () => {
    const html = renderToStaticMarkup(
      createElement(DictFrequencyChips, {
        frequencies: [
          { dictionaryId: "a", title: "JPDB", rank: 120, display: "120㋕" },
          { dictionaryId: "b", title: "Anime", rank: 77, display: null },
        ],
      }),
    );
    expect(html).toContain("120㋕");
    expect(html).toContain(">77<");
  });
});
