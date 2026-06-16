// Captions spike harness v2 — diagnostic (ROADMAP_ENGENHARIA "Portão de risco").
//
// Question: can we fetch a video's Japanese caption track reliably from the
// SERVER, or must the browser extension be the primary ingestion path?
//
// v2 distinguishes the failure modes that v1 collapsed:
//   - video has NO captions at all
//   - video has captions but NO Japanese track
//   - Japanese track EXISTS but its content download is empty (gated)
//   - Japanese track exists AND downloads (server-side works)
// It reports the languages each method can see, tries multiple track formats
// (default/json3/srv3/vtt), and probes the WEB and ANDROID InnerTube clients
// plus the watch page. Zero deps (Node 18+). Always exits 0.
//
// Run: node captions.mjs   ·   env: SPIKE_QUERY, SPIKE_VIDEOS, SPIKE_LIMIT

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA_WEB =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA_ANDROID = "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip";
const BASE_HEADERS = { "accept-language": "ja,en;q=0.8", cookie: "CONSENT=YES+1" };
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const QUERY = process.env.SPIKE_QUERY || "日本語 ニュース";
const LIMIT = Number(process.env.SPIKE_LIMIT || 6);

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { ...opts, headers: { "user-agent": UA_WEB, ...BASE_HEADERS, ...opts.headers }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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

function tracksOf(playerResponse) {
  const t = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(t) ? t : null;
}

function pickJa(tracks) {
  const ja = tracks.filter((t) => (t.languageCode || "").startsWith("ja"));
  return ja.find((t) => t.kind !== "asr") || ja[0] || null;
}

function decodeXml(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Try several formats; return the first that yields actual caption lines. */
async function fetchTrack(baseUrl) {
  const base = baseUrl.replace(/&amp;/g, "&");
  const sep = base.includes("?") ? "&" : "?";
  const variants = [
    ["default", base],
    ["json3", `${base}${sep}fmt=json3`],
    ["srv3", `${base}${sep}fmt=srv3`],
    ["vtt", `${base}${sep}fmt=vtt`],
  ];
  let lastBytes = 0;
  for (const [fmt, url] of variants) {
    try {
      const res = await get(url);
      const body = await res.text();
      lastBytes = Math.max(lastBytes, body.length);
      if (!res.ok || !body.trim()) continue;
      let lines = [];
      if (body.trimStart().startsWith("{")) {
        const data = JSON.parse(body);
        lines = (data.events || []).filter((e) => Array.isArray(e.segs))
          .map((e) => e.segs.map((s) => s.utf8 || "").join("").trim()).filter(Boolean);
      } else if (body.includes("<text")) {
        lines = [...body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeXml(m[1]).trim()).filter(Boolean);
      } else if (/^WEBVTT/m.test(body)) {
        lines = body.split("\n").filter((l) => l.trim() && !l.includes("-->") && !/^WEBVTT/.test(l) && !/^\d+$/.test(l)).map((s) => s.trim());
      }
      if (lines.length) return { lines, bytes: body.length, fmt };
    } catch { /* try next */ }
  }
  return { lines: [], bytes: lastBytes, fmt: null };
}

/** Classify one (source, video): what's visible, and can we fetch JP content. */
async function classify(playerResponse) {
  const tracks = tracksOf(playerResponse);
  if (!tracks) return { status: "no-captions", langs: [] };
  const langs = [...new Set(tracks.map((t) => `${t.languageCode}${t.kind === "asr" ? "(asr)" : ""}`))];
  const ja = pickJa(tracks);
  if (!ja) return { status: "no-ja", langs };
  const got = await fetchTrack(ja.baseUrl);
  if (got.lines.length === 0) return { status: "ja-gated", langs, kind: ja.kind === "asr" ? "asr" : "manual", bytes: got.bytes };
  return { status: "ok", langs, kind: ja.kind === "asr" ? "asr" : "manual", lines: got.lines.length, sample: got.lines[0], fmt: got.fmt };
}

/* -------------------------- player-response sources -------------------------- */

async function innertube(id, client) {
  const ctx = client === "ANDROID"
    ? { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 34, hl: "ja", gl: "JP" }
    : { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "ja", gl: "JP" };
  const res = await get(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": client === "ANDROID" ? UA_ANDROID : UA_WEB },
    body: JSON.stringify({ videoId: id, context: { client: ctx } }),
  });
  if (!res.ok) throw new Error(`player HTTP ${res.status}`);
  return res.json();
}

async function watchPage(id) {
  const res = await get(`https://www.youtube.com/watch?v=${id}`);
  if (!res.ok) throw new Error(`watch HTTP ${res.status}`);
  return sliceJson(await res.text(), "ytInitialPlayerResponse");
}

function ytDlpAvailable() {
  try { return spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0; } catch { return false; }
}

async function ytDlp(id) {
  const dir = mkdtempSync(join(tmpdir(), "spike-"));
  const r = spawnSync("yt-dlp", ["--skip-download", "--write-subs", "--write-auto-subs",
    "--sub-langs", "ja.*,ja", "--sub-format", "json3", "--no-warnings",
    "-o", join(dir, "%(id)s.%(ext)s"), `https://www.youtube.com/watch?v=${id}`],
    { encoding: "utf8", timeout: 60000 });
  const files = readdirSync(dir).filter((f) => f.includes(".ja"));
  if (files.length === 0) return { status: "no-ja", langs: [], note: (r.stderr || "").split("\n").find((l) => l.includes("ERROR"))?.slice(0, 80) || "" };
  const data = JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
  const lines = (data.events || []).filter((e) => Array.isArray(e.segs)).map((e) => e.segs.map((s) => s.utf8 || "").join("").trim()).filter(Boolean);
  return lines.length ? { status: "ok", langs: ["ja"], kind: files[0].includes("auto") ? "asr" : "manual", lines: lines.length, sample: lines[0] } : { status: "ja-gated", langs: ["ja"] };
}

/* -------------------------- seed + run -------------------------- */

/** Accept a bare 11-char id, a watch URL, or a youtu.be URL. */
function extractId(s) {
  const str = s.trim();
  const m =
    str.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    str.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    str.match(/\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/) ||
    str.match(/^([A-Za-z0-9_-]{11})$/) ||
    str.match(/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : str;
}

async function seed() {
  if (process.env.SPIKE_VIDEOS) return process.env.SPIKE_VIDEOS.split(",").map((s) => extractId(s)).filter(Boolean).slice(0, LIMIT);
  try {
    const html = await (await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(QUERY)}`)).text();
    return [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, LIMIT);
  } catch { return []; }
}

const hasYtDlp = ytDlpAvailable();
const methods = [
  ["innertube-web", (id) => innertube(id, "WEB").then(classify)],
  ["innertube-android", (id) => innertube(id, "ANDROID").then(classify)],
  ["watch-page", (id) => watchPage(id).then(classify)],
];
if (hasYtDlp) methods.push(["yt-dlp", (id) => ytDlp(id)]);

console.log(`# Captions spike (v2 diagnostic)\n`);
console.log(`query: ${process.env.SPIKE_VIDEOS ? "(override list)" : QUERY} · limit: ${LIMIT} · yt-dlp: ${hasYtDlp ? "yes" : "no"}\n`);

const ids = await seed();
console.log(`videos: ${ids.join(", ") || "(none — search blocked? pass SPIKE_VIDEOS)"}\n`);

const agg = Object.fromEntries(methods.map(([n]) => [n, { ok: 0, jaSeen: 0, jaGated: 0, anyCaps: 0, total: 0 }]));
const rows = [];
const langSightings = new Set();

for (const id of ids) {
  for (const [name, fn] of methods) {
    const t0 = Date.now();
    let r;
    try { r = await fn(id); } catch (e) { r = { status: "error", note: String(e?.message || e), langs: [] }; }
    const ms = Date.now() - t0;
    const a = agg[name];
    a.total++;
    (r.langs || []).forEach((l) => langSightings.add(l));
    if (r.status === "ok") { a.ok++; a.jaSeen++; a.anyCaps++; }
    else if (r.status === "ja-gated") { a.jaGated++; a.jaSeen++; a.anyCaps++; }
    else if (r.status === "no-ja") a.anyCaps++;
    rows.push({ id, name, ...r });
    const detail = r.status === "ok" ? `${r.kind} ${r.lines} lines [${r.fmt}] "${(r.sample || "").slice(0, 18)}"`
      : r.status === "no-ja" ? `has: ${r.langs.join(",") || "—"}`
      : r.status === "ja-gated" ? `JA TRACK FOUND but content empty (${r.bytes || 0}B) — gated`
      : r.status === "no-captions" ? "no captions field"
      : r.note || r.status;
    console.log(`${r.status === "ok" ? "OK " : "ERR"} ${id} [${name}] ${detail} (${ms}ms)`);
  }
}

/* -------------------------- verdict -------------------------- */

const tot = (k) => methods.reduce((s, [n]) => s + agg[n][k], 0);
const okAny = rows.some((r) => r.status === "ok");
const jaSeenAny = tot("jaSeen") > 0;
const jaGatedAny = tot("jaGated") > 0;
const capsSeenAny = tot("anyCaps") > 0;
const best = Object.entries(agg).sort((a, b) => b[1].ok - a[1].ok)[0];

let verdict;
if (!ids.length) {
  verdict = "INCONCLUSIVE — could not seed videos. Re-run with SPIKE_VIDEOS=id1,id2.";
} else if (best && best[1].ok / best[1].total >= 0.5) {
  verdict = `SERVER-SIDE VIABLE — "${best[0]}" downloaded JP captions on ${best[1].ok}/${best[1].total}. Build T0.7/T0.8 server-side with this method; extension stays Phase 2.`;
} else if (jaSeenAny && !okAny) {
  verdict = `SERVER-SIDE GATED — JP caption tracks are VISIBLE but their content downloads empty (${tot("jaGated")} gated). Metadata is reachable; the timedtext content needs a browser/session (PO token). → Browser EXTENSION as primary ingestion (it fetches captions in the user's authenticated context). Reorder T0.7/T0.8.`;
} else if (capsSeenAny && !jaSeenAny) {
  verdict = `INCONCLUSIVE (test set) — captions exist (langs seen: ${[...langSightings].join(", ")}) but none of the seeded videos had a JP track. Re-run with SPIKE_QUERY pointed at Japanese content, or SPIKE_VIDEOS of known JP-subbed videos.`;
} else if (!capsSeenAny) {
  verdict = `SERVER-SIDE BLOCKED — no caption metadata visible at all (likely IP/bot gating). Extension is the robust path.`;
} else {
  verdict = `SERVER-SIDE FRAGILE — best "${best?.[0]}" at ${best ? best[1].ok : 0}/${best ? best[1].total : 0}. Lean on the extension.`;
}

const summary = [
  `# Captions spike — verdict (v2)`,
  ``,
  `**${verdict}**`,
  ``,
  `Query: \`${process.env.SPIKE_VIDEOS ? "(override list)" : QUERY}\` · videos: ${ids.length} · caption langs seen across all: ${[...langSightings].join(", ") || "none"}`,
  ``,
  `| Method | JP downloaded | JP seen | JP gated | had captions |`,
  `|---|---|---|---|---|`,
  ...methods.map(([n]) => `| ${n} | ${agg[n].ok}/${agg[n].total} | ${agg[n].jaSeen} | ${agg[n].jaGated} | ${agg[n].anyCaps} |`),
  ``,
  `<details><summary>Per-video</summary>`,
  ``,
  `| Video | Method | Status | Langs / note |`,
  `|---|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${((r.langs || []).join(",") || r.note || r.sample || "").toString().replace(/\|/g, "/").slice(0, 70)} |`),
  ``,
  `</details>`,
].join("\n");

console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(0);
