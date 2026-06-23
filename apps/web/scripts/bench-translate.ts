/**
 * Benchmark layer-1 translation latency across providers, on real subtitle text.
 *
 * Drives the SAME `translateBatch` production uses (via createProvider), so the
 * number here is the per-chunk wall-clock the user feels in the player. Reads a
 * Japanese transcript, segments it into subtitle-like lines, and runs each
 * configured provider once over the first chunk (default 30 lines), printing
 * timing + the translations side by side (so you can eyeball quality too — e.g.
 * the 为什么 ASR glitch in the PreCure clip).
 *
 *   # pick providers by which keys you export (run only the ones with a key):
 *   MINIMAX_API_KEY=...  \
 *   DEEPSEEK_API_KEY=... [DEEPSEEK_MODEL=deepseek-chat] \
 *   pnpm --filter @fuchine/web exec tsx scripts/bench-translate.ts [path/to/text.txt]
 *
 * Env:
 *   TARGET           target language code (default "en" — matches translate.ts)
 *   FROM             source language code (default "ja")
 *   CHUNK            lines per run (default 30 — one player chunk)
 *   DEEPSEEK_BASE_URL  override (default https://api.deepseek.com/v1)
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createProvider, type LlmProvider, type ProviderConfig } from "@fuchine/llm";

const DEFAULT_TXT =
  "C:\\Users\\gabri\\OneDrive\\Documentos\\dev\\whisper\\audio_5min-gpt4o-mini.txt";

const txtPath = process.argv[2] ?? DEFAULT_TXT;
const FROM = process.env.FROM ?? "ja";
const TARGET = process.env.TARGET ?? "en";
const CHUNK = Number(process.env.CHUNK ?? "30");

/** Split a transcript blob into subtitle-ish lines: break after JA/ASCII
 *  sentence terminators and on newlines, drop blanks. Good enough for a bench. */
function segment(raw: string): string[] {
  return raw
    .replace(/\r/g, "")
    .split(/(?<=[。．！？!?])/u)
    .flatMap((s) => s.split("\n"))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type Candidate = { label: string; cfg: ProviderConfig };

/** Only providers whose key is present get benched. */
function candidates(): Candidate[] {
  const list: Candidate[] = [];
  if (process.env.MINIMAX_API_KEY) {
    const model = process.env.MINIMAX_MODEL; // override default minimax-m3
    list.push({
      label: model ? `minimax (${model})` : "minimax-m3",
      cfg: { provider: "minimax", apiKey: process.env.MINIMAX_API_KEY, model },
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    list.push({
      label: `deepseek (${model})`,
      cfg: {
        provider: "openai-compatible",
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
        model,
      },
    });
  }
  if (process.env.OPENAI_API_KEY) {
    list.push({
      label: process.env.OPENAI_MODEL ?? "openai (gpt-4o-mini)",
      cfg: {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      },
    });
  }
  // Generic OpenAI-compatible gateway (e.g. a multi-LLM key): one base URL + key,
  // many models. GATEWAY_MODELS is comma-separated → one bench run per model.
  if (process.env.GATEWAY_API_KEY && process.env.GATEWAY_BASE_URL && process.env.GATEWAY_MODELS) {
    for (const model of process.env.GATEWAY_MODELS.split(",").map((m) => m.trim()).filter(Boolean)) {
      list.push({
        label: model,
        cfg: {
          provider: "openai-compatible",
          apiKey: process.env.GATEWAY_API_KEY,
          baseUrl: process.env.GATEWAY_BASE_URL,
          model,
        },
      });
    }
  }
  return list;
}

type Run = {
  label: string;
  ms: number;
  translations: (string | null)[];
  error?: string;
};

async function benchOne(c: Candidate, lines: string[]): Promise<Run> {
  let provider: LlmProvider;
  try {
    provider = createProvider(c.cfg);
  } catch (err) {
    return { label: c.label, ms: 0, translations: [], error: (err as Error).message };
  }
  const t0 = performance.now();
  try {
    const translations = await provider.translateBatch(lines, { from: FROM, to: TARGET });
    return { label: c.label, ms: performance.now() - t0, translations };
  } catch (err) {
    return { label: c.label, ms: performance.now() - t0, translations: [], error: (err as Error).message };
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** DeepL is NOT OpenAI-compatible: its own /v2/translate, batch of texts, own
 *  auth + lang codes. Pure MT (never returns null for SFX). Free key ends ":fx". */
function deeplLang(code: string, isTarget: boolean): string {
  const m: Record<string, string> = {
    en: isTarget ? "EN-US" : "EN",
    pt: isTarget ? "PT-BR" : "PT",
    ja: "JA",
    es: "ES",
  };
  return m[code] ?? code.toUpperCase();
}

async function benchDeepL(key: string, lines: string[]): Promise<Run> {
  const free = key.trim().endsWith(":fx");
  const host = free ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const label = `deepl (${free ? "free" : "pro"})`;
  const t0 = performance.now();
  try {
    const res = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: lines,
        source_lang: deeplLang(FROM, false),
        target_lang: deeplLang(TARGET, true),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = performance.now() - t0;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { label, ms, translations: [], error: `HTTP ${res.status}: ${detail.slice(0, 140)}` };
    }
    const data = (await res.json()) as { translations?: { text?: string }[] };
    return { label, ms, translations: (data.translations ?? []).map((t) => t.text ?? null) };
  } catch (err) {
    return { label, ms: performance.now() - t0, translations: [], error: (err as Error).message };
  }
}

async function main() {
  const raw = readFileSync(txtPath, "utf8");
  const allLines = segment(raw);
  const lines = allLines.slice(0, CHUNK);

  console.log(`\n=== translate bench: ${FROM} → ${TARGET} ===`);
  console.log(`text:   ${txtPath}`);
  console.log(`lines:  ${lines.length} (of ${allLines.length} segmented; CHUNK=${CHUNK})\n`);

  const cands = candidates();
  const deeplKey = process.env.DEEPL_API_KEY;
  if (cands.length === 0 && !deeplKey) {
    console.error(
      "No provider keys set. Export at least one of:\n" +
        "  MINIMAX_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY,\n" +
        "  GATEWAY_BASE_URL+GATEWAY_API_KEY+GATEWAY_MODELS, or DEEPL_API_KEY",
    );
    process.exit(1);
  }

  const runs: Run[] = [];
  for (const c of cands) {
    process.stdout.write(`running ${c.label} … `);
    const run = await benchOne(c, lines);
    if (run.error) console.log(`ERROR: ${run.error}`);
    else console.log(`${(run.ms / 1000).toFixed(1)}s  (${(run.ms / lines.length).toFixed(0)} ms/line)`);
    runs.push(run);
  }
  if (deeplKey) {
    process.stdout.write("running deepl … ");
    const run = await benchDeepL(deeplKey, lines);
    if (run.error) console.log(`ERROR: ${run.error}`);
    else console.log(`${(run.ms / 1000).toFixed(1)}s  (${(run.ms / lines.length).toFixed(0)} ms/line)`);
    runs.push(run);
  }

  // Timing summary.
  console.log(`\n--- timing (${lines.length} lines / 1 batch call) ---`);
  for (const r of runs) {
    if (r.error) { console.log(`  ${r.label.padEnd(22)}  ERROR`); continue; }
    console.log(`  ${r.label.padEnd(22)}  ${(r.ms / 1000).toFixed(1)}s total   ${(r.ms / lines.length).toFixed(0)} ms/line`);
  }

  // Side-by-side translations so quality is visible too.
  console.log(`\n--- output (first ${Math.min(12, lines.length)} lines) ---`);
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    console.log(`\n[${i}] ${truncate(lines[i]!, 60)}`);
    for (const r of runs) {
      const v = r.error ? "(error)" : r.translations[i] ?? "(null)";
      console.log(`    ${r.label.padEnd(20)} → ${truncate(String(v), 80)}`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("bench crashed:", err);
  process.exit(1);
});
