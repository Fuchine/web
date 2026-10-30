"use client";

// Settings → Review: desired retention + "Optimize my schedule" (T3.1).
// The optimizer runs in a Web Worker on the learner's own review history
// (GET /api/review/logs/export); the fitted FSRS-7 weights are stored only
// when the learner applies them (PUT /api/settings/fsrs, validated server-side).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@fuchine/ui";
import type { OptimizerMessage, OptimizerRequest } from "@/lib/fsrs-optimizer.worker";

type FsrsView = {
  params: number[] | null;
  desiredRetention: number;
  defaultRetention: number;
  retentionRange: [number, number];
  recommendedBand: [number, number];
  reviewCount: number;
  minReviewsToOptimize: number;
  workload: { method: "approximation"; note: string; cards: number; points: { retention: number; reviewsPerDay: number }[] };
};

type Run =
  | { phase: "idle" }
  | { phase: "running"; progress: number }
  | { phase: "done"; params: number[]; before: number; after: number; items: number; trainMs: number }
  | { phase: "applied"; before: number; after: number }
  | { phase: "error"; message: string };

const pct = (r: number) => `${Math.round(r * 100)}%`;

function RowShell({ title, desc, children, below }: { title: string; desc?: React.ReactNode; children: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-[550] text-fg">{title}</p>
          {desc && <p className="mt-0.5 text-[13px] text-muted">{desc}</p>}
        </div>
        <div className="flex-none">{children}</div>
      </div>
      {below}
    </div>
  );
}

export function FsrsRows() {
  const [view, setView] = useState<FsrsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retention, setRetention] = useState(0.9);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/fsrs", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const v = (await res.json()) as FsrsView;
      setView(v);
      setRetention(v.desiredRetention);
    } catch {
      setLoadError("Could not load your schedule settings.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      workerRef.current?.terminate();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load]);

  async function put(body: { params?: number[] | null; desiredRetention?: number | null }) {
    setSaveError(null);
    const res = await fetch("/api/settings/fsrs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as FsrsView & { error?: string };
    if (!res.ok) {
      setSaveError(data.error ?? "Could not save.");
      return false;
    }
    setView(data);
    return true;
  }

  function onRetention(v: number) {
    setRetention(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void put({ desiredRetention: v }), 400);
  }

  async function optimize() {
    if (!view) return;
    setRun({ phase: "running", progress: 0 });
    try {
      const res = await fetch("/api/review/logs/export", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not download your review history.");
      const csv = await res.text();
      workerRef.current?.terminate();
      const worker = new Worker(new URL("../../lib/fsrs-optimizer.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<OptimizerMessage>) => {
        const m = e.data;
        if (m.type === "progress") {
          setRun({ phase: "running", progress: m.total > 0 ? m.current / m.total : 0 });
        } else if (m.type === "done") {
          setRun({ phase: "done", params: m.params, before: m.before.logLoss, after: m.after.logLoss, items: m.items, trainMs: m.trainMs });
          worker.terminate();
        } else {
          setRun({ phase: "error", message: m.error });
          worker.terminate();
        }
      };
      worker.onerror = () => {
        setRun({ phase: "error", message: "The optimizer could not start in this browser." });
        worker.terminate();
      };
      const req: OptimizerRequest = {
        csv,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        currentParams: view.params,
      };
      worker.postMessage(req);
    } catch (err) {
      setRun({ phase: "error", message: err instanceof Error ? err.message : "Optimization failed." });
    }
  }

  async function apply() {
    if (run.phase !== "done") return;
    if (await put({ params: run.params })) setRun({ phase: "applied", before: run.before, after: run.after });
  }

  if (loadError) {
    return <RowShell title="Schedule (FSRS-7)" desc={loadError}><span /></RowShell>;
  }
  if (!view) {
    return <RowShell title="Schedule (FSRS-7)" desc="Loading…"><span /></RowShell>;
  }

  const [min, max] = view.retentionRange;
  const [bandLo, bandHi] = view.recommendedBand;
  const at = (r: number) => ((r - min) / (max - min)) * 100;
  const inBand = retention >= bandLo - 1e-9 && retention <= bandHi + 1e-9;
  const point = view.workload.points.find((p) => Math.abs(p.retention - retention) < 0.005);
  const enough = view.reviewCount >= view.minReviewsToOptimize;
  const fmt = (n: number) => n.toFixed(4);

  return (
    <>
      <RowShell
        title="Desired retention"
        desc={`How likely you should be to remember a card when it comes back. Default ${pct(view.defaultRetention)}; ${pct(bandLo)}–${pct(bandHi)} is the recommended range.`}
        below={
          <div className="mt-3">
            <input
              type="range"
              min={min}
              max={max}
              step={0.01}
              value={retention}
              aria-label="Desired retention"
              aria-valuetext={pct(retention)}
              onChange={(e) => onRetention(Number(e.target.value))}
              className="block h-6 w-full cursor-pointer accent-[var(--accent)]"
            />
            {/* Recommended band, drawn under the track at the same scale. */}
            <div className="relative mt-0.5 h-1.5 rounded-full bg-border" aria-hidden="true">
              <div
                className="absolute inset-y-0 rounded-full bg-ok"
                style={{ left: `${at(bandLo)}%`, width: `${at(bandHi) - at(bandLo)}%` }}
              />
            </div>
            <div className="relative mt-1 h-4 text-[12px] text-faint">
              <span className="absolute left-0">{pct(min)}</span>
              <span
                className="absolute -translate-x-1/2 whitespace-nowrap text-ok"
                style={{ left: `${(at(bandLo) + at(bandHi)) / 2}%` }}
              >
                Recommended {pct(bandLo)}–{pct(bandHi)}
              </span>
              <span className="absolute right-0">{pct(max)}</span>
            </div>
            <p className="mt-2 text-[13px] text-muted" data-testid="workload">
              {point && view.workload.cards > 0
                ? <>≈ <span className="font-[600] text-fg tabular-nums">{point.reviewsPerDay}</span> reviews/day for your {view.workload.cards} learned cards</>
                : "No learned cards yet — the workload estimate appears after your first reviews."}
              <span className="block text-[12px] text-faint">{view.workload.note}</span>
            </p>
            {saveError && <p className="mt-2 text-[13px] text-error">{saveError}</p>}
          </div>
        }
      >
        <span className={`text-[14px] font-[600] tabular-nums ${inBand ? "text-fg" : "text-muted"}`} data-testid="retention-value">
          {pct(retention)}
        </span>
      </RowShell>

      <RowShell
        title="Optimize my schedule"
        desc={
          enough
            ? `Fits FSRS-7 to your ${view.reviewCount} reviews, right here in your browser. ${view.params ? "Custom parameters are active." : "Using the default parameters."}`
            : `Needs at least ${view.minReviewsToOptimize} reviews — you have ${view.reviewCount}. Until then the default parameters are used.`
        }
        below={
          <div className="mt-2 text-[13px]" data-testid="optimizer-status">
            {run.phase === "running" && (
              <p className="text-muted">Training on your reviews… {Math.round(run.progress * 100)}%</p>
            )}
            {run.phase === "error" && <p className="text-error">{run.message}</p>}
            {run.phase === "done" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-fg">
                  Log loss on your reviews: <span className="tabular-nums" data-testid="logloss-before">{fmt(run.before)}</span>
                  {" → "}
                  <span className="font-[600] tabular-nums" data-testid="logloss-after">{fmt(run.after)}</span>
                  <span className="text-muted"> (lower is better · {run.items} samples · {run.trainMs} ms)</span>
                </p>
                {run.after < run.before ? (
                  <>
                    <Button size="sm" onClick={() => void apply()}>Use these parameters</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRun({ phase: "idle" })}>Discard</Button>
                  </>
                ) : (
                  <p className="text-muted">Your current parameters already fit as well — nothing to change.</p>
                )}
              </div>
            )}
            {run.phase === "applied" && (
              <p className="text-ok">
                Applied. Log loss {fmt(run.before)} → {fmt(run.after)}. Your cards&apos; memory was recomputed; upcoming reviews use the new schedule.
              </p>
            )}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {view.params && (
            <Button size="sm" variant="ghost" disabled={run.phase === "running"}
              onClick={() => void put({ params: null }).then((ok) => ok && setRun({ phase: "idle" }))}>
              Reset to defaults
            </Button>
          )}
          <Button size="sm" disabled={!enough || run.phase === "running"} onClick={() => void optimize()}>
            {run.phase === "running" ? "Optimizing…" : "Optimize my schedule"}
          </Button>
        </div>
      </RowShell>
    </>
  );
}
