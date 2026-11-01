import { createElement, Fragment, type CSSProperties, type ReactNode } from "react";
import type { DictDefinition, ScElement, ScNode } from "@fuchine/db/types";
import { sanitizeStructuredContent } from "@fuchine/db/structured-content";
import { cn } from "../../lib/cn";

/**
 * Renders an imported dictionary definition (T3.4): Yomitan structured
 * content, already whitelisted by the importer, is sanitized AGAIN here and
 * turned into React elements — never HTML strings, never
 * dangerouslySetInnerHTML. Tags: div span ul ol li table thead tbody tfoot tr
 * td th ruby rt rp br a details summary; links only http(s), opened with
 * rel="noopener noreferrer"; images are dropped (not imported yet); the only
 * styles are bold, italic, under/over/strike-through and sub/super.
 */

function styleOf(node: ScElement): CSSProperties | undefined {
  const s = node.style;
  if (!s) return undefined;
  const out: CSSProperties = {};
  if (s.fontWeight === "bold") out.fontWeight = 700;
  if (s.fontStyle === "italic") out.fontStyle = "italic";
  if (s.textDecorationLine) out.textDecorationLine = s.textDecorationLine;
  if (s.verticalAlign) out.verticalAlign = s.verticalAlign;
  return out;
}

function render(node: ScNode, key?: number): ReactNode {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return createElement(Fragment, key === undefined ? null : { key }, ...node.map((n, i) => render(n, i)));
  }
  if (node.tag === "br") return createElement("br", { key });
  // details/summary have browser-native toggles; shown flat (always open).
  const tag = node.tag === "details" ? "div" : node.tag === "summary" ? "div" : node.tag;
  const props: Record<string, unknown> = {
    key,
    style: styleOf(node),
    lang: node.lang,
    title: node.title,
    className: `sc-${node.tag}`,
  };
  if (tag === "a") {
    props.href = node.href;
    props.target = "_blank";
    props.rel = "noopener noreferrer nofollow";
  }
  if (tag === "td" || tag === "th") {
    props.colSpan = node.colSpan;
    props.rowSpan = node.rowSpan;
  }
  const children = node.content === undefined ? [] : [render(node.content)];
  return createElement(tag, props, ...children);
}

export function StructuredContent({ content, className }: { content: unknown; className?: string }) {
  const safe = sanitizeStructuredContent(content);
  if (safe === null) return null;
  return <div className={cn("sc-root", className)}>{render(safe)}</div>;
}

/** One stored definition: plain text, or structured content. */
export function DictDefinitionView({ def, className }: { def: DictDefinition; className?: string }) {
  if (def.type === "text") return <div className={cn("sc-root", className)}>{def.text}</div>;
  return <StructuredContent content={def.content} className={className} />;
}
