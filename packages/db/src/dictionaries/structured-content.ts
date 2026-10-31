// Yomitan structured content → Fuchine's whitelisted ScNode (T3.4).
//
// Source format: `structuredContent` in yomidevs/yomitan
// ext/data/schemas/dictionary-term-bank-v3-schema.json (master d3c54c10,
// fetched 2026-10-31). Pure and dependency-free: the importer runs it on every
// definition before storing, and @fuchine/ui's renderer runs it again on what
// it reads (defense in depth — the database is not trusted to be clean).
//
// Rules:
//   - Tags kept: div span ul ol li table thead tbody tfoot tr td th ruby rt rp
//     br a details summary. Unknown tags are unwrapped (their text stays).
//   - img is DROPPED (with its alt text): images are not imported yet.
//   - a: only absolute http(s) hrefs survive (rendered with rel="noopener
//     noreferrer" target="_blank"); Yomitan's internal "?query" links and
//     anything else become a plain span.
//   - Attributes: lang (BCP-47 shape), title (≤ 200 chars), colSpan/rowSpan
//     (1..50, td/th). `data` (data-* attributes) is dropped.
//   - style: only fontWeight=bold, fontStyle=italic, textDecorationLine
//     underline|line-through|overline, verticalAlign sub|super. No colors,
//     sizes, margins or any free-form CSS value.
//   - Limits: depth ≤ 32, ≤ 4000 nodes and ≤ 64 KiB of text per definition;
//     beyond that the rest is cut.

import type { ScElement, ScNode, ScStyle, ScTag } from "../types";

const TAGS: ReadonlySet<string> = new Set<ScTag>([
  "div", "span", "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "ruby", "rt", "rp", "br", "a", "details", "summary",
]);
/** Dropped together with their content (no textual fallback worth keeping). */
const DROPPED: ReadonlySet<string> = new Set(["img", "image", "script", "style", "iframe", "object", "embed"]);

export const SC_MAX_DEPTH = 32;
export const SC_MAX_NODES = 4000;
export const SC_MAX_TEXT = 64 * 1024;

const LANG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,4}$/;

export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length > 2048) return false;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeStyle(raw: unknown): ScStyle | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const s = raw as Record<string, unknown>;
  const out: ScStyle = {};
  if (s.fontWeight === "bold") out.fontWeight = "bold";
  if (s.fontStyle === "italic") out.fontStyle = "italic";
  const deco = Array.isArray(s.textDecorationLine) ? s.textDecorationLine : [s.textDecorationLine];
  const d = deco.find((x) => x === "underline" || x === "line-through" || x === "overline");
  if (d) out.textDecorationLine = d as ScStyle["textDecorationLine"];
  if (s.verticalAlign === "sub" || s.verticalAlign === "super") out.verticalAlign = s.verticalAlign;
  return Object.keys(out).length ? out : undefined;
}

type Budget = { nodes: number; text: number };

function walk(raw: unknown, depth: number, b: Budget): ScNode | null {
  if (depth > SC_MAX_DEPTH || b.nodes >= SC_MAX_NODES || b.text >= SC_MAX_TEXT) return null;
  b.nodes++;
  if (typeof raw === "string") {
    const room = SC_MAX_TEXT - b.text;
    const t = raw.length > room ? raw.slice(0, room) : raw;
    b.text += t.length;
    return t;
  }
  if (typeof raw === "number") return walk(String(raw), depth, b);
  if (Array.isArray(raw)) {
    const out: ScNode[] = [];
    for (const child of raw) {
      const c = walk(child, depth + 1, b);
      if (c !== null && c !== "") out.push(c);
    }
    return out.length === 0 ? null : out.length === 1 ? out[0]! : out;
  }
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  const tag = typeof o.tag === "string" ? o.tag.toLowerCase() : "";
  if (DROPPED.has(tag)) return null;
  const content = o.content === undefined ? null : walk(o.content, depth + 1, b);
  if (!TAGS.has(tag)) return content; // unknown → unwrap, keep the text
  if (tag === "br") return { tag: "br" };

  let finalTag = tag as ScTag;
  const el: ScElement = { tag: finalTag };
  if (tag === "a") {
    if (isSafeHref(o.href)) el.href = o.href;
    else finalTag = el.tag = "span";
  }
  if (content !== null) el.content = content;
  if (typeof o.lang === "string" && LANG_RE.test(o.lang)) el.lang = o.lang;
  if (typeof o.title === "string" && o.title.trim()) el.title = o.title.slice(0, 200);
  if (finalTag === "td" || finalTag === "th") {
    for (const k of ["colSpan", "rowSpan"] as const) {
      const v = o[k];
      if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50) el[k] = v;
    }
  }
  const style = sanitizeStyle(o.style);
  if (style) el.style = style;
  return el;
}

/** Sanitize one structured-content value; null when nothing renderable is left. */
export function sanitizeStructuredContent(raw: unknown): ScNode | null {
  return walk(raw, 0, { nodes: 0, text: 0 });
}

/** Plain text of a node (ruby readings in parentheses), for search/tests/exports. */
export function scToText(node: ScNode | null | undefined): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(scToText).join("");
  if (node.tag === "br") return "\n";
  if (node.tag === "rt") return `(${scToText(node.content)})`;
  if (node.tag === "rp") return "";
  const inner = scToText(node.content);
  return node.tag === "div" || node.tag === "li" || node.tag === "tr" ? `${inner}\n` : inner;
}
