// explainLine eval CLI (T3.12). Needs a real key; not part of CI.
//
//   EVAL_PROVIDER=openai-compatible EVAL_BASE_URL=https://api.minimax.io/v1 \
//   EVAL_MODEL=minimax-m3 EVAL_API_KEY=sk-... \
//   pnpm --filter @fuchine/llm eval:explain
//
// Env:
//   EVAL_PROVIDER     minimax | openai | openai-compatible   (required)
//   EVAL_API_KEY      provider key                           (required)
//   EVAL_MODEL        model id (default: the provider's default)
//   EVAL_BASE_URL     endpoint override (required for openai-compatible)
//   EVAL_GOLD         gold JSONL path (default: eval/gold/explain-ja-en.jsonl)
//   EVAL_ONLY         comma-separated item ids to run
//   EVAL_LIMIT        run only the first N items
//   EVAL_CONCURRENCY  parallel calls (default 2)
//   EVAL_OUT_DIR      report directory (default: eval/reports)
//
// Writes eval/reports/<date>-<model>-v<PROMPT_VERSION>.md and prints the
// aggregate. Exit code is 0 even when items fail (it's a measurement, not a
// gate); 1 only when the run itself can't happen (config, gold file).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROMPT_VERSION } from "../src/contract";
import { readCurrentLockState } from "../src/prompt-lock";
import type { ProviderName } from "../src/providers";
import { parseGoldSet } from "./gold";
import { renderReport, reportFileName, summarize } from "./report";
import { createProviderSubject, runEval } from "./runner";

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(EVAL_DIR, "..");
const SUPPORTED: ProviderName[] = ["minimax", "openai", "openai-compatible"];

function die(msg: string): never {
  console.error(`eval:explain: ${msg}`);
  process.exit(1);
}

function pathFromEnv(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  // pnpm --filter runs scripts from the package dir; resolve relative to it.
  return isAbsolute(value) ? value : resolve(PKG_DIR, value);
}

async function main() {
  const env = process.env;
  const provider = env.EVAL_PROVIDER as ProviderName | undefined;
  if (!provider || !SUPPORTED.includes(provider)) {
    die(`set EVAL_PROVIDER to one of ${SUPPORTED.join(", ")}`);
  }
  if (!env.EVAL_API_KEY) die("set EVAL_API_KEY (the eval calls a real model)");

  const goldPath = pathFromEnv(env.EVAL_GOLD, resolve(EVAL_DIR, "gold/explain-ja-en.jsonl"));
  const goldText = readFileSync(goldPath, "utf8");
  const gold = parseGoldSet(goldText);
  let items = gold.items;
  if (env.EVAL_ONLY) {
    const only = new Set(env.EVAL_ONLY.split(",").map((s) => s.trim()).filter(Boolean));
    items = items.filter((i) => only.has(i.id));
  }
  if (env.EVAL_LIMIT) items = items.slice(0, Math.max(0, Number(env.EVAL_LIMIT) || 0));
  if (items.length === 0) die("no gold items selected");

  let subject;
  try {
    subject = createProviderSubject({
      provider,
      apiKey: env.EVAL_API_KEY,
      model: env.EVAL_MODEL || undefined,
      baseUrl: env.EVAL_BASE_URL || undefined,
    });
  } catch (err) {
    die((err as Error).message);
  }

  const startedAt = new Date();
  console.log(`eval:explain — ${items.length} item(s), ${subject.provider}/${subject.model}, prompt v${PROMPT_VERSION}`);
  const results = await runEval(items, subject, {
    concurrency: Number(env.EVAL_CONCURRENCY) || 2,
    onItem: (r, done) => {
      const mark = r.pass ? "PASS " : r.errored ? "ERROR" : "FAIL ";
      const why = r.errored ? r.error : r.checks.filter((c) => !c.pass).map((c) => c.name).join(", ");
      console.log(`  [${String(done).padStart(3)}/${items.length}] ${mark} ${r.id}${why ? ` — ${why}` : ""}`);
    },
  });

  const lock = readCurrentLockState();
  const date = startedAt.toISOString().slice(0, 10);
  const report = renderReport(results, {
    date,
    startedAt: startedAt.toISOString(),
    provider: subject.provider,
    model: subject.model,
    baseUrl: subject.baseUrl,
    promptVersion: PROMPT_VERSION,
    promptsSha256: lock.promptsSha256,
    goldFile: relative(PKG_DIR, goldPath),
    goldSha256: createHash("sha256").update(goldText).digest("hex"),
    goldMeta: gold.meta,
    usage: subject.usage,
  });

  const outDir = pathFromEnv(env.EVAL_OUT_DIR, resolve(EVAL_DIR, "reports"));
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, reportFileName(date, subject.model, PROMPT_VERSION));
  writeFileSync(outFile, report);

  const s = summarize(results);
  console.log(
    `\n${s.passed}/${s.total} items passed every check (${((s.passRate) * 100).toFixed(1)}%); ` +
      `${s.errored} transport error(s).`,
  );
  for (const c of s.byCheck) console.log(`  ${c.name.padEnd(28)} ${c.passed}/${c.applicable}`);
  const rel = relative(process.cwd(), outFile);
  console.log(`report: ${rel && !rel.startsWith("..") ? rel : outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
