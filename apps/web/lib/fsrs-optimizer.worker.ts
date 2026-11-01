// FSRS-7 optimizer, in the browser (T3.1). Runs in a dedicated Web Worker so
// training never blocks the page. Uses the open-spaced-repetition org's
// fsrs-rs build for WASI — the threadless `wasm32-wasip1` flavour of
// @open-spaced-repetition/binding: no SharedArrayBuffer, so the page needs no
// cross-origin isolation (COOP/COEP), which would break the YouTube embeds.
//
// In: { csv, timezone, currentParams } — the revlog CSV from
// GET /api/review/logs/export, the learner's IANA timezone, and the params in
// use now (null = FSRS-7 defaults).
// Out: progress messages, then { type: "done", params, before, after, ... }.

import { instantiate } from "@open-spaced-repetition/binding-wasm32-wasip1/workerd";

export type OptimizerRequest = { csv: string; timezone: string; currentParams: number[] | null };
export type OptimizerEvaluation = { logLoss: number; rmseBins: number };
export type OptimizerMessage =
  | { type: "progress"; current: number; total: number }
  | {
      type: "done";
      params: number[];
      before: OptimizerEvaluation;
      after: OptimizerEvaluation;
      items: number;
      trainMs: number;
    }
  | { type: "error"; error: string };

/** Anki's default day rollover (04:00 local); FSRS-7 uses fractional days anyway. */
const NEXT_DAY_STARTS_AT = 4;

// Typed locally so the app's DOM lib isn't widened with the webworker lib.
type WorkerScope = {
  postMessage(message: OptimizerMessage): void;
  onmessage: ((e: MessageEvent<OptimizerRequest>) => void) | null;
};
const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (e: MessageEvent<OptimizerRequest>) => {
  const post = (m: OptimizerMessage) => ctx.postMessage(m);
  try {
    const { csv, timezone, currentParams } = e.data;
    const wasmUrl = new URL("@open-spaced-repetition/binding-wasm32-wasip1/wasm", import.meta.url);
    // compile() over the bytes, not compileStreaming: it doesn't depend on the
    // server sending Content-Type: application/wasm.
    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`Could not load the optimizer (${res.status}).`);
    const wasmModule = await WebAssembly.compile(await res.arrayBuffer());
    const b = await instantiate(wasmModule);

    const items = b.convertCsvToFsrsItems(new TextEncoder().encode(csv), NEXT_DAY_STARTS_AT, timezone, "FSRS-7");
    if (items.length === 0) throw new Error("No usable reviews in your history yet.");

    const evaluate = (p: number[] | null) => {
      const model = p ? new b.FSRSBinding(p) : new b.FSRSBinding();
      const r = model.evaluate(items);
      return { logLoss: r.logLoss, rmseBins: r.rmseBins };
    };
    const before = evaluate(currentParams);

    const t0 = performance.now();
    const params = await b.computeParameters(items, {
      modelVersion: "FSRS-7",
      enableShortTerm: true,
      numRelearningSteps: 1,
      progress: (current: number, total: number) => {
        post({ type: "progress", current, total });
      },
    });
    const trainMs = Math.round(performance.now() - t0);
    post({ type: "done", params, before, after: evaluate(params), items: items.length, trainMs });
  } catch (err) {
    post({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
