// Markdown report for an explainLine eval run (T3.12).

import type { CheckName, ItemResult } from "./checks";
import type { GoldMeta } from "./gold";
import type { UsageTotals } from "./runner";

export type ReportMeta = {
  date: string; // YYYY-MM-DD
  startedAt: string; // ISO
  provider: string;
  model: string;
  baseUrl?: string;
  promptVersion: number;
  promptsSha256: string;
  goldFile: string;
  goldSha256: string;
  goldMeta: GoldMeta | null;
  usage?: UsageTotals;
};

export type Summary = {
  total: number;
  completed: number;
  errored: number;
  passed: number;
  /** passed / total — errors count as failures. */
  passRate: number;
  /** passed / completed — model quality with transport errors excluded. */
  passRateCompleted: number;
  byCheck: { name: CheckName; passed: number; applicable: number }[];
  byTopic: { topic: string; passed: number; total: number }[];
};

export function summarize(results: ItemResult[]): Summary {
  const completed = results.filter((r) => !r.errored);
  const passed = results.filter((r) => r.pass).length;
  const checkMap = new Map<CheckName, { passed: number; applicable: number }>();
  for (const r of completed) {
    for (const c of r.checks) {
      const s = checkMap.get(c.name) ?? { passed: 0, applicable: 0 };
      s.applicable++;
      if (c.pass) s.passed++;
      checkMap.set(c.name, s);
    }
  }
  const topicMap = new Map<string, { passed: number; total: number }>();
  for (const r of results) {
    const s = topicMap.get(r.topic) ?? { passed: 0, total: 0 };
    s.total++;
    if (r.pass) s.passed++;
    topicMap.set(r.topic, s);
  }
  return {
    total: results.length,
    completed: completed.length,
    errored: results.length - completed.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    passRateCompleted: completed.length ? passed / completed.length : 0,
    byCheck: [...checkMap].map(([name, s]) => ({ name, ...s })),
    byTopic: [...topicMap].map(([topic, s]) => ({ topic, ...s })).sort((a, b) => a.topic.localeCompare(b.topic)),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** Escape for a markdown table cell. */
const cell = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** `<date>-<model>-v<N>.md`, filesystem-safe. */
export function reportFileName(date: string, model: string, promptVersion: number): string {
  const safeModel = model.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "model";
  return `${date}-${safeModel}-v${promptVersion}.md`;
}

export function renderReport(results: ItemResult[], meta: ReportMeta): string {
  const s = summarize(results);
  const out: string[] = [];
  out.push(`# explainLine eval — ${meta.model} · prompt v${meta.promptVersion}`);
  out.push("");
  const reviewed = meta.goldMeta?.status === "reviewed";
  if (!reviewed) {
    out.push(
      `> **Unreviewed gold set.** ${meta.goldMeta?.note ?? "The gold set has not been reviewed by a human."} ` +
        `These numbers measure agreement with automatic checks and AI-written assertions; ` +
        `do not publish them as an accuracy rate until a human has reviewed the items.`,
    );
    out.push("");
  }
  out.push("| | |");
  out.push("|---|---|");
  out.push(`| Date | ${meta.startedAt} |`);
  out.push(`| Provider | \`${meta.provider}\`${meta.baseUrl ? ` (${cell(meta.baseUrl)})` : ""} |`);
  out.push(`| Model | \`${cell(meta.model)}\` |`);
  out.push(`| PROMPT_VERSION | ${meta.promptVersion} (prompts.ts sha256 \`${meta.promptsSha256.slice(0, 12)}\`) |`);
  out.push(`| Gold set | \`${cell(meta.goldFile)}\` — ${s.total} items, sha256 \`${meta.goldSha256.slice(0, 12)}\`, status: ${cell(String(meta.goldMeta?.status ?? "unknown"))} |`);
  if (meta.usage) {
    out.push(`| Usage | ${meta.usage.calls} calls · ${meta.usage.inTokens} in / ${meta.usage.outTokens} out tokens · ${(meta.usage.ms / 1000).toFixed(1)} s total latency |`);
  }
  out.push("");

  out.push("## Aggregate");
  out.push("");
  out.push(`- **Items passing every check: ${s.passed}/${s.total} (${pct(s.passRate)})**`);
  out.push(`- Excluding ${s.errored} transport error(s): ${s.passed}/${s.completed} (${pct(s.passRateCompleted)})`);
  out.push("");
  out.push("| Check | Passed | Rate |");
  out.push("|---|---|---|");
  for (const c of s.byCheck) out.push(`| \`${c.name}\` | ${c.passed}/${c.applicable} | ${pct(c.passed / c.applicable)} |`);
  out.push("");
  out.push("| Topic | Passed | Rate |");
  out.push("|---|---|---|");
  for (const t of s.byTopic) out.push(`| ${cell(t.topic)} | ${t.passed}/${t.total} | ${pct(t.passed / t.total)} |`);
  out.push("");

  out.push("## Items");
  out.push("");
  out.push("| | Id | Topic | Line | Failed checks |");
  out.push("|---|---|---|---|---|");
  for (const r of results) {
    const mark = r.pass ? "PASS" : r.errored ? "ERROR" : "FAIL";
    const failed = r.errored
      ? cell(r.error ?? "error")
      : r.checks.filter((c) => !c.pass).map((c) => `\`${c.name}\`: ${cell(c.detail ?? "")}`).join("<br>");
    out.push(`| ${mark} | \`${r.id}\` | ${cell(r.topic)} | ${cell(r.line)} | ${failed || "—"} |`);
  }
  out.push("");

  const failing = results.filter((r) => !r.pass && r.raw !== null);
  if (failing.length) {
    out.push("## Raw output of failing items");
    out.push("");
    for (const r of failing) {
      out.push(`<details><summary><code>${r.id}</code> — ${r.line}</summary>`);
      out.push("");
      out.push("```json");
      out.push(prettyRaw(r.raw!));
      out.push("```");
      out.push("");
      out.push("</details>");
      out.push("");
    }
  }
  return out.join("\n");
}

function prettyRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw.replace(/```/g, "ˋˋˋ");
  }
}
