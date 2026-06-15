// Captions spike harness (ROADMAP_ENGENHARIA "Portão de risco").
//
// Question: can we fetch the Japanese caption track of arbitrary YouTube videos
// reliably from the SERVER, or must the browser extension be the primary
// ingestion path? This script answers it empirically and prints a verdict.
//
// Zero dependencies (Node 22+ global fetch). Self-seeds test videos via YouTube
// search, then tries several server-side methods per video. yt-dlp is used if
// present on PATH. Always exits 0 — failures ARE the measurement.
//
// Run: node tools/spike/captions.mjs
// Env: SPIKE_QUERY (search query), SPIKE_VIDEOS (comma-separated ids, override),
//      SPIKE_LIMIT (how many videos to test, default 6).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADERS = {
  "user-agent": UA,
  "accept-language": "ja,en;q=0.8",
  cookie: "CONSENT=YES+1",
};
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const QUERY = process.env.SPIKE_QUERY || "日本語 ニュース";
const LIMIT = Number(process.env.SPIKE_LIMIT || 6);

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...opts.headers }, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Brace-match a JSON object that follows a marker in HTML. */
function sliceJson(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(start, j + 1)); } catch { return null; }
    }
  }
  return null;
}

function pickJaTrack(tracks) {
  if (!Array.isArray(tracks)) return null;
  const ja = tracks.filter((t) => (t.languageCode || "").startsWith("ja"));
  // Prefer a manual (human) track over ASR (auto).
  return ja.find((t) => t.kind !== "asr") || ja[0] || null;
}

async function fetchTrackLines(baseUrl) {
  const url = baseUrl.replace(/&amp;/g, "&") + "&fmt=json3";
  const res = await get(url);
  if (!res.ok) throw new Error(`track HTTP ${res.status}`);
  const data = await res.json();
  const events = (data.events || []).filter((e) => Array.isArray(e.segs));
  const lines = events.map((e) => e.segs.map((s) => s.utf8 || "").join("").trim()).filter(Boolean);
  return lines;
}

/** Seed test videos by scraping YouTube search results. */
async function seedVideos() {
  if (process.env.SPIKE_VIDEOS) {
    return process.env.SPIKE_VIDEOS.split(",").map((s) => s.trim()).filter(Boolean).slice(0, LIMIT);
  }
  try {
    const res = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(QUERY)}`);
    const html = await res.text();
    const ids = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
    return [...new Set(ids)].slice(0, LIMIT);
  } catch (err) {
    return { error: String(err) };
  }
}

/* -------------------------- methods -------------------------- */

async function methodInnertube(id) {
  const res = await get(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      videoId: id,
      context: { client: { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "ja", gl: "JP" } },
    }),
  });
  if (!res.ok) throw new Error(`player HTTP ${res.status}`);
  const data = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = pickJaTrack(tracks);
  if (!track) throw new Error("no ja caption track");
  const lines = await fetchTrackLines(track.baseUrl);
  return { kind: track.kind === "asr" ? "asr" : "manual", lines };
}

async function methodWatchPage(id) {
  const res = await get(`https://www.youtube.com/watch?v=${id}`);
  if (!res.ok) throw new Error(`watch HTTP ${res.status}`);
  const html = await res.text();
  const pr = sliceJson(html, "ytInitialPlayerResponse");
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = pickJaTrack(tracks);
  if (!track) throw new Error("no ja caption track");
  const lines = await fetchTrackLines(track.baseUrl);
  return { kind: track.kind === "asr" ? "asr" : "manual", lines };
}

function ytDlpAvailable() {
  return spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0;
}

async function methodYtDlp(id) {
  const dir = mkdtempSync(join(tmpdir(), "spike-"));
  const r = spawnSync(
    "yt-dlp",
    ["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "ja.*,ja",
     "--sub-format", "json3", "--no-warnings", "-o", join(dir, "%(id)s.%(ext)s"),
     `https://www.youtube.com/watch?v=${id}`],
    { encoding: "utf8", timeout: 60000 },
  );
  const files = readdirSync(dir).filter((f) => f.includes(".ja"));
  if (files.length === 0) throw new Error(`no subtitle file (${(r.stderr || "").slice(0, 120)})`);
  const data = JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
  const lines = (data.events || []).filter((e) => Array.isArray(e.segs))
    .map((e) => e.segs.map((s) => s.utf8 || "").join("").trim()).filter(Boolean);
  const kind = files[0].includes("auto") || /auto/.test(files[0]) ? "asr" : "manual";
  return { kind, lines };
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ok: true, ms: Date.now() - t0, ...r };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: String(err?.message || err) };
  }
}

/* -------------------------- run -------------------------- */

const methods = [
  ["innertube", methodInnertube],
  ["watch-page", methodWatchPage],
];
const hasYtDlp = ytDlpAvailable();
if (hasYtDlp) methods.push(["yt-dlp", methodYtDlp]);

console.log(`# Captions spike\n`);
console.log(`query: ${process.env.SPIKE_VIDEOS ? "(override list)" : QUERY} · limit: ${LIMIT} · yt-dlp: ${hasYtDlp ? "yes" : "no"}\n`);

const videos = await seedVideos();
if (!Array.isArray(videos) || videos.length === 0) {
  console.log(`Could not seed test videos: ${JSON.stringify(videos)}`);
  console.log("If search scraping is blocked, pass SPIKE_VIDEOS=id1,id2,...");
}
const ids = Array.isArray(videos) ? videos : [];
console.log(`videos: ${ids.join(", ") || "(none)"}\n`);

const stats = Object.fromEntries(methods.map(([n]) => [n, { ok: 0, manual: 0, asr: 0, total: 0 }]));
const rows = [];

for (const id of ids) {
  for (const [name, fn] of methods) {
    const r = await timed(() => fn(id));
    const s = stats[name];
    s.total++;
    if (r.ok) {
      s.ok++;
      if (r.kind === "asr") s.asr++; else s.manual++;
    }
    rows.push({ id, method: name, ok: r.ok, kind: r.kind || "", lines: r.lines?.length || 0,
      sample: (r.lines?.[0] || "").slice(0, 24), error: r.error || "" });
    console.log(`${r.ok ? "OK " : "ERR"} ${id} [${name}] ${r.ok ? `${r.kind} ${r.lines?.length} lines "${(r.lines?.[0] || "").slice(0, 20)}"` : r.error} (${r.ms}ms)`);
  }
}

/* -------------------------- verdict -------------------------- */

function pct(s) { return s.total ? Math.round((s.ok / s.total) * 100) : 0; }
const best = Object.entries(stats).sort((a, b) => pct(b[1]) - pct(a[1]))[0];
let verdict;
if (!ids.length) {
  verdict = "INCONCLUSIVE — could not seed videos (search blocked?). Re-run with SPIKE_VIDEOS.";
} else if (best && pct(best[1]) >= 80) {
  verdict = `SERVER-SIDE VIABLE — "${best[0]}" works on ${pct(best[1])}% of videos. ` +
    `Keep server ingestion (T0.7/T0.8 as planned); extension stays Phase 2.`;
} else if (best && pct(best[1]) >= 40) {
  verdict = `SERVER-SIDE PARTIAL — best "${best[0]}" at ${pct(best[1])}%. ` +
    `Usable with retries/fallback, but flaky; consider extension as a fallback path.`;
} else {
  verdict = `SERVER-SIDE FRAGILE — no method above 40%. ` +
    `Promote the browser extension to the primary ingestion path and reorder T0.7/T0.8.`;
}

const summary = [
  `# Captions spike — verdict`,
  ``,
  `**${verdict}**`,
  ``,
  `Query: \`${process.env.SPIKE_VIDEOS ? "(override list)" : QUERY}\` · videos tested: ${ids.length} · yt-dlp: ${hasYtDlp ? "yes" : "no"}`,
  ``,
  `| Method | Success | Manual | ASR |`,
  `|---|---|---|---|`,
  ...methods.map(([n]) => `| ${n} | ${stats[n].ok}/${stats[n].total} (${pct(stats[n])}%) | ${stats[n].manual} | ${stats[n].asr} |`),
  ``,
  `<details><summary>Per-video results</summary>`,
  ``,
  `| Video | Method | OK | Kind | Lines | Sample | Error |`,
  `|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.method} | ${r.ok ? "✓" : "✗"} | ${r.kind} | ${r.lines} | ${r.sample.replace(/\|/g, "/")} | ${r.error.replace(/\|/g, "/").slice(0, 60)} |`),
  ``,
  `</details>`,
  ``,
].join("\n");

console.log("\n" + summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

process.exit(0);
