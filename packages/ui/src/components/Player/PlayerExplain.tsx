"use client";

import { type ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { Explanation } from "@fuchine/db";

const TAG_LABEL: Record<string, string> = {
  noun: "Noun",
  verb: "Verb",
  adjective: "Adj",
  adverb: "Adverb",
  particle: "Particle",
  grammar: "Grammar",
  expression: "Expression",
};

export type ExplainFocal = {
  textOriginal: string;
  textTranslation: string | null;
  focusSurface?: string | null;
};

export interface PlayerExplainProps {
  focal: ExplainFocal | null;
  explanation: Explanation | null;
  loading: boolean;
  error: string | null;
  onRegenerate: () => void;
  onSaveNote?: () => void;
  className?: string;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" fill="currentColor" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M6 4h12v16l-6-4-6 4V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function renderSentence(text: string, focus?: string | null): ReactNode {
  if (!focus || !text.includes(focus)) return text;
  const i = text.indexOf(focus);
  return (
    <>
      {text.slice(0, i)}
      <span className="ex-hl">{focus}</span>
      {text.slice(i + focus.length)}
    </>
  );
}

export function PlayerExplain({
  focal,
  explanation,
  loading,
  error,
  onRegenerate,
  onSaveNote,
  className,
}: PlayerExplainProps): ReactNode {
  return (
    <div className={cn("explain", className)}>
      <div className="ex-scroll">
        {focal ? (
          <div className="ex-sentence">
            <div className="ex-ja jp">{renderSentence(focal.textOriginal, focal.focusSurface)}</div>
            {focal.textTranslation && <div className="ex-en">{focal.textTranslation}</div>}
          </div>
        ) : (
          <div className="ex-state">Select a line to explain it.</div>
        )}

        {focal && loading && <div className="ex-state">Generating explanation…</div>}

        {focal && error && !loading && (
          <div className="ex-state ex-error">
            <span>{error}</span>
            <button type="button" className="ex-retry" onClick={onRegenerate}>Try again</button>
          </div>
        )}

        {focal && explanation && !loading && (
          <>
            <div className="ex-meta">
              <SparkIcon />
              <span>Generated breakdown</span>
              <span className="ex-dot" />
              Grammar
            </div>

            {explanation.breakdown.length > 0 && (
              <ul className="ex-parts">
                {explanation.breakdown.map((p, i) => (
                  <li key={i} className={cn("ex-part", p.accent && "accent")}>
                    <div className="ex-part-head">
                      <span className="ex-tok jp">{p.surface}</span>
                      <span className="ex-chip">{TAG_LABEL[p.tag] ?? p.tag}</span>
                      {p.gloss && <span className="ex-gloss">{p.gloss}</span>}
                    </div>
                    {p.note && <p className="ex-note">{p.note}</p>}
                  </li>
                ))}
              </ul>
            )}

            {explanation.plainTerms && (
              <div className="ex-prose">
                <div className="ex-prose-label">In plain terms</div>
                <p>{explanation.plainTerms}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ex-foot">
        <button type="button" className="ex-fbtn" onClick={onRegenerate} disabled={!focal || loading}>
          <RefreshIcon /> Regenerate
        </button>
        <button
          type="button"
          className="ex-fbtn primary"
          onClick={onSaveNote}
          disabled
          title="Coming soon"
        >
          <BookmarkIcon /> Save note
        </button>
      </div>
    </div>
  );
}
