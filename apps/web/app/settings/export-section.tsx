"use client";

// Settings → Data → Export to Anki (T3.3). Lapis (default) or the basic
// 4-column deck, optional deck name, all cards or only curated ones, and the
// review history as a second file. "Send to Anki" pushes the Lapis notes
// through AnkiConnect on the learner's own machine (lib/anki-connect.ts).

import { useState } from "react";
import { Button } from "@fuchine/ui";
import { pushToAnki, type LapisNoteJson } from "@/lib/anki-connect";

type Preset = "lapis" | "basic";
type Filter = "all" | "curated";

function Choice<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex rounded-[8px] border border-border p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-[500] transition-colors ${
            value === o.v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Fetch a file and hand it to the browser as a download (two in a row work). */
async function download(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Export failed (${res.status})`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function ExportRows() {
  const [preset, setPreset] = useState<Preset>("lapis");
  const [filter, setFilter] = useState<Filter>("all");
  const [deck, setDeck] = useState("");
  const [history, setHistory] = useState(true);
  const [busy, setBusy] = useState<"export" | "anki" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const query = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ preset, filter, ...extra });
    if (deck.trim()) p.set("deck", deck.trim());
    if (history && preset === "lapis") p.set("history", "1");
    return p.toString();
  };

  const onExport = async () => {
    setBusy("export");
    setMessage(null);
    try {
      await download(`/api/export/deck?${query()}`, "fuchine-deck.txt");
      if (history) await download("/api/export/history", "fuchine-review-history.csv");
      setMessage({ kind: "ok", text: history ? "Downloaded the deck and your review history." : "Downloaded the deck." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Export failed." });
    } finally {
      setBusy(null);
    }
  };

  const onSendToAnki = async () => {
    setBusy("anki");
    setMessage(null);
    try {
      const res = await fetch(`/api/export/deck?${query({ preset: "lapis", format: "json" })}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const data = (await res.json()) as { deck: string; notes: LapisNoteJson[] };
      if (data.notes.length === 0) {
        setMessage({ kind: "ok", text: "No cards to send." });
        return;
      }
      const r = await pushToAnki(data.deck, data.notes);
      setMessage({
        kind: "ok",
        text: `Added ${r.added} note${r.added === 1 ? "" : "s"} to "${data.deck}"` +
          (r.skipped ? `; skipped ${r.skipped} already in the deck.` : ".") +
          " No audio is attached: clips stay on YouTube, linked in MiscInfo.",
      });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't send to Anki." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-b border-border px-5 py-4">
      <p className="text-[14px] font-[550] text-fg">Export to Anki</p>
      <p className="mt-0.5 text-[13px] text-muted">
        Text only: no audio or images are attached. Each card links back to its clip on YouTube.
      </p>

      <div className="mt-4 grid gap-3 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-fg">Format</span>
          <Choice
            label="Format"
            value={preset}
            onChange={setPreset}
            options={[{ v: "lapis", l: "Lapis note type" }, { v: "basic", l: "Basic (4 columns)" }]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-fg">Cards</span>
          <Choice
            label="Cards"
            value={filter}
            onChange={setFilter}
            options={[{ v: "all", l: "All" }, { v: "curated", l: "Only curated" }]}
          />
        </div>
        {preset === "lapis" && (
          <label className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-fg">Deck name</span>
            <input
              type="text"
              value={deck}
              maxLength={100}
              placeholder="Fuchine"
              onChange={(e) => setDeck(e.target.value)}
              className="w-48 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[14px] text-fg"
            />
          </label>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="text-fg">Include review history</span>
            <span className="block text-muted">
              Anki can&apos;t import FSRS memory from a text file, so your cards start as new in Anki.
              You also get <code>fuchine-review-history.csv</code> (every review, in the FSRS
              optimizer&apos;s format) to fit your parameters
              {preset === "lapis" && <>, and each note is tagged with its current state, e.g. <code>fuchine::due::2026-11-03</code></>}.
            </span>
          </span>
        </label>
        {preset === "lapis" && (
          <p className="text-muted">
            Needs the Lapis note type in Anki (Anki 2.1.55 or later). Each note carries a stable ID, so importing again matches the notes you already have instead of duplicating them.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy !== null} onClick={() => void onExport()}>
          {busy === "export" ? "Exporting…" : "Download"}
        </Button>
        {preset === "lapis" && (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void onSendToAnki()}>
            {busy === "anki" ? "Sending…" : "Send to Anki"}
          </Button>
        )}
      </div>
      {preset === "lapis" && (
        <p className="mt-2 text-[12.5px] text-muted">
          Send to Anki adds the notes straight into Anki on this computer through the AnkiConnect
          add-on. It only adds notes; it never syncs or changes existing ones.
        </p>
      )}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-3 text-[13px] ${message.kind === "error" ? "text-error" : "text-fg"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
