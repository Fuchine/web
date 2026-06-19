// Downloads the latest jmdict-simplified English dictionary release and unzips
// the JSON into seeds/data/ (gitignored). Used by `seed:jmdict`.
//
// Uses the GitHub releases API to resolve the newest version automatically, so
// the seed never pins a stale dictionary build.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";

const REPO = "scriptin/jmdict-simplified";
export const DATA_DIR = "seeds/data";

export interface ReleaseAsset {
  name: string;
  browser_download_url?: string;
}

/**
 * Pick the full English dictionary `.zip` from a release's asset list.
 *
 * The release ships many variants; we want `jmdict-eng-<version>.json.zip` and
 * must skip the `common` subset, the `examples` build, the all-languages dump,
 * other languages, and the `.tgz` archives. The character right after
 * `jmdict-eng-` is a digit only for the full English build.
 */
export function selectEngAsset<T extends { name: string }>(
  assets: readonly T[],
): T | null {
  return assets.find((a) => /^jmdict-eng-\d[\w.+]*\.json\.zip$/.test(a.name)) ?? null;
}

async function latestEngAsset(): Promise<Required<ReleaseAsset>> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      "User-Agent": "fuchine-seed",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub releases API returned ${res.status} ${res.statusText}`);
  }
  const release = (await res.json()) as { tag_name: string; assets: ReleaseAsset[] };
  const asset = selectEngAsset(release.assets);
  if (!asset?.browser_download_url) {
    throw new Error(
      `No full English JMdict .zip found in release ${release.tag_name}`,
    );
  }
  console.log(`[jmdict] latest release ${release.tag_name}`);
  return asset as Required<ReleaseAsset>;
}

/**
 * Ensure the full English JMdict JSON is present locally and return its path.
 * Downloads + unzips the latest release unless the file already exists.
 */
export async function ensureJmdict(): Promise<string> {
  const asset = await latestEngAsset();
  const jsonName = asset.name.replace(/\.zip$/, "");
  const jsonPath = join(DATA_DIR, jsonName);

  if (existsSync(jsonPath)) {
    console.log(`[jmdict] already downloaded: ${jsonPath}`);
    return jsonPath;
  }

  console.log(`[jmdict] downloading ${asset.name} …`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const zipped = new Uint8Array(await res.arrayBuffer());
  console.log(`[jmdict] unzipping (${(zipped.length / 1e6).toFixed(1)} MB) …`);

  const entries = unzipSync(zipped);
  const jsonEntry = Object.keys(entries).find((n) => n.endsWith(".json"));
  if (!jsonEntry) throw new Error("No .json entry inside the JMdict archive");

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(jsonPath, entries[jsonEntry]!);
  console.log(`[jmdict] wrote ${jsonPath}`);
  return jsonPath;
}
