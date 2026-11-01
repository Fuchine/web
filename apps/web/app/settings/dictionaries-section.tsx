"use client";

// Settings → Dictionaries (T3.4). Each user picks which of the instance's
// imported Yomitan dictionaries the popup and the dictionary screen show, in
// what order, and which frequency list drives the Anki export's FreqSort.
// Admins (ADMIN_EMAILS) can also upload, disable and remove dictionaries.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@fuchine/ui";

type Installed = {
  id: string;
  title: string;
  revision: string;
  type: string;
  monolingual: boolean;
  attribution: string | null;
  author: string | null;
  url: string | null;
  termCount: number;
  frequencyCount: number;
  pitchCount: number;
  enabled: boolean;
};

type View = { installed: Installed[]; enabled: string[]; frequency: string | null; isAdmin: boolean };

function kindLabel(d: Installed): string {
  const parts: string[] = [];
  if (d.termCount) parts.push(`${d.termCount.toLocaleString()} terms${d.monolingual ? " (monolingual)" : ""}`);
  if (d.frequencyCount) parts.push(`${d.frequencyCount.toLocaleString()} frequency ranks`);
  if (d.pitchCount) parts.push(`${d.pitchCount.toLocaleString()} pitch accents`);
  return parts.join(" · ");
}

export function DictionaryRows() {
  const [view, setView] = useState<View | null>(null);
  const [all, setAll] = useState<Installed[] | null>(null); // admin: disabled included
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/dictionaries", { cache: "no-store" });
    if (!res.ok) return;
    const v = (await res.json()) as View;
    setView(v);
    if (v.isAdmin) {
      const a = await fetch("/api/admin/dictionaries", { cache: "no-store" });
      if (a.ok) setAll(((await a.json()) as { dictionaries: Installed[] }).dictionaries);
    }
  }, []);

  useEffect(() => {
    load().catch(() => setMessage({ kind: "error", text: "Could not load dictionaries." }));
  }, [load]);

  const save = async (enabled: string[], frequency: string | null) => {
    if (!view) return;
    const prev = view;
    setView({ ...view, enabled, frequency });
    setMessage(null);
    const res = await fetch("/api/settings/dictionaries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, frequency }),
    }).catch(() => null);
    if (!res?.ok) {
      setView(prev);
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setMessage({ kind: "error", text: body?.error ?? "Could not save." });
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setMessage({ kind: "ok", text: `Importing ${file.name}… large dictionaries take a few minutes.` });
    try {
      const res = await fetch("/api/admin/dictionaries", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; result?: { title: string; replaced: boolean; terms: number; frequencies: number; pitches: number } }
        | null;
      if (!res.ok || !body?.result) throw new Error(body?.error ?? `Upload failed (${res.status})`);
      const r = body.result;
      setMessage({
        kind: "ok",
        text: `${r.replaced ? "Updated" : "Imported"} "${r.title}": ${r.terms} terms, ${r.frequencies} frequency ranks, ${r.pitches} pitch accents.`,
      });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const adminAction = async (id: string, init: RequestInit, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/dictionaries/${id}`, init).catch(() => null);
    setBusy(false);
    if (!res?.ok) setMessage({ kind: "error", text: "That didn't work." });
    await load();
  };

  if (!view) {
    return <div className="px-5 py-4 text-[13px] text-muted">Loading dictionaries…</div>;
  }

  const byId = new Map(view.installed.map((d) => [d.id, d]));
  const enabled = view.enabled.filter((id) => byId.has(id));
  const others = view.installed.filter((d) => !enabled.includes(d.id));
  const freqLists = view.installed.filter((d) => d.frequencyCount > 0);
  const move = (i: number, by: -1 | 1) => {
    const next = [...enabled];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    void save(next, view.frequency);
  };

  return (
    <div className="px-5 py-4">
      <p className="text-[14px] font-[550] text-fg">Extra dictionaries</p>
      <p className="mt-0.5 text-[13px] text-muted">
        Shown under the JMdict entry in the popup and the dictionary, in this order. Frequency lists add their rank;
        pitch dictionaries show next to Kanjium.
      </p>

      {view.installed.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          No dictionaries are installed on this instance yet.
          {view.isAdmin ? " Upload a Yomitan .zip below." : " Your instance's admin can add Yomitan dictionaries."}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2" aria-label="Dictionaries">
          {enabled.map((id, i) => {
            const d = byId.get(id)!;
            return (
              <li key={id} className="flex items-center gap-3 rounded-[10px] border border-accent-line bg-accent-soft-2 px-3 py-2">
                <input type="checkbox" checked aria-label={`Hide ${d.title}`}
                  onChange={() => void save(enabled.filter((x) => x !== id), view.frequency)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-[550] text-fg">{d.title}</p>
                  <p className="truncate text-[12px] text-muted">{kindLabel(d)}</p>
                </div>
                <button className="grid h-7 w-7 place-items-center rounded-[6px] text-faint hover:text-fg disabled:opacity-40"
                  aria-label={`Move ${d.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="grid h-7 w-7 place-items-center rounded-[6px] text-faint hover:text-fg disabled:opacity-40"
                  aria-label={`Move ${d.title} down`} disabled={i === enabled.length - 1} onClick={() => move(i, 1)}>↓</button>
              </li>
            );
          })}
          {others.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2">
              <input type="checkbox" checked={false} aria-label={`Show ${d.title}`}
                onChange={() => void save([...enabled, d.id], view.frequency)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-[550] text-fg">{d.title}</p>
                <p className="truncate text-[12px] text-muted">{kindLabel(d)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {freqLists.length > 0 && (
        <label className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span className="text-fg">Frequency for Anki export (FreqSort)</span>
          <select
            className="h-9 rounded-[8px] border border-border-strong bg-surface px-2 text-[13px] text-fg"
            value={view.frequency ?? ""}
            onChange={(e) => void save(enabled, e.target.value || null)}
          >
            <option value="">JMdict rank (default)</option>
            {freqLists.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
      )}

      {view.isAdmin && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[13.5px] font-[550] text-fg">Manage (admin)</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Yomitan .zip files: term, frequency and pitch dictionaries. Images are not imported. Uploading a title that
            exists replaces it. You are responsible for having the right to use the dictionaries you import. For large
            files, prefer the CLI (<code>dict:import</code>, see the self-hosting guide).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Working…" : "Upload dictionary"}
            </Button>
          </div>
          {all && all.length > 0 && (
            <ul className="mt-3 grid gap-1.5 text-[12.5px]">
              {all.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <span className={`flex-1 truncate ${d.enabled ? "text-fg" : "text-faint line-through"}`}>
                    {d.title} <span className="text-muted">· rev {d.revision}{d.attribution ? ` · ${d.attribution}` : ""}</span>
                  </span>
                  <Button variant="quiet" size="sm" disabled={busy}
                    onClick={() => void adminAction(d.id, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: !d.enabled }),
                    })}>
                    {d.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="quiet" size="sm" disabled={busy}
                    onClick={() => void adminAction(d.id, { method: "DELETE" }, `Remove "${d.title}" for everyone?`)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-3 text-[12.5px] ${message.kind === "error" ? "text-error" : "text-muted"}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
