// Operator CLI for imported dictionaries (T3.4) — the primary way to install a
// Yomitan dictionary on an instance. See docs/SELF_HOSTING.md ("Dictionaries").
//
//   pnpm --filter @fuchine/worker dict:import <dictionary.zip>
//   pnpm --filter @fuchine/worker dict:list
//   pnpm --filter @fuchine/worker dict:remove "<title>"
//
// In compose: docker compose run --rm -v "$PWD/dicts:/dicts:ro" worker \
//   pnpm --filter @fuchine/worker dict:import /dicts/jpdb-freq.zip
//
// Re-importing a title replaces its rows (same id: users keep their choice).
// Uncompressed size cap: DICT_MAX_UNCOMPRESSED_MB (default 200).
// You are responsible for having the right to use the dictionaries you import.
// Exit codes: 0 ok · 1 usage error · 2 import rejected / nothing to remove.

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { asc, eq } from "drizzle-orm";
import { createDb, dictionaries } from "@fuchine/db";
import {
  YomitanImportError,
  deleteDictionary,
  importYomitanZip,
  maxUncompressedBytesFromEnv,
} from "@fuchine/db/dictionaries";
import { env } from "../env";

const USAGE = `usage:
  dict import <dictionary.zip>
  dict list
  dict remove <title>`;

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error(USAGE);
  process.exit(1);
}

/** pnpm --filter runs us in apps/worker; resolve relative paths from where the user typed. */
function userPath(p: string): string {
  return isAbsolute(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

async function main(): Promise<number> {
  const [command, arg] = process.argv.slice(2);
  const db = createDb(env.databaseUrl, { max: 1 });

  switch (command) {
    case "import": {
      if (!arg) usage("a .zip path is required");
      const path = userPath(arg);
      const max = maxUncompressedBytesFromEnv();
      const size = statSync(path).size;
      if (size > max) {
        console.error(`error: ${path} is ${(size / 1048576).toFixed(1)} MB, over the limit (DICT_MAX_UNCOMPRESSED_MB)`);
        return 2;
      }
      try {
        const r = await importYomitanZip(db, new Uint8Array(readFileSync(path)), {
          maxUncompressedBytes: max,
          onProgress: (m) => console.log(`[dict] ${m}`),
        });
        console.log(
          `[dict] ${r.replaced ? "replaced" : "imported"} "${r.title}" rev ${r.revision} (${r.type}): ` +
            `${r.terms} terms, ${r.frequencies} frequencies, ${r.pitches} pitch accents` +
            `${r.skipped ? `, ${r.skipped} malformed rows skipped` : ""} in ${(r.ms / 1000).toFixed(1)} s`,
        );
        console.log("[dict] users enable it in Settings → Dictionaries.");
        return 0;
      } catch (e) {
        if (e instanceof YomitanImportError) {
          console.error(`error: ${e.message}`);
          return 2;
        }
        throw e;
      }
    }
    case "list": {
      const rows = await db.select().from(dictionaries).orderBy(asc(dictionaries.title));
      if (rows.length === 0) console.log("no dictionaries imported");
      for (const d of rows) {
        console.log(
          `${d.title} · rev ${d.revision} · ${d.type} · ${d.termCount} terms, ${d.frequencyCount} freq, ` +
            `${d.pitchCount} pitch · ${d.enabled ? "enabled" : "disabled"} · ${d.importedAt.toISOString().slice(0, 10)}`,
        );
      }
      return 0;
    }
    case "remove": {
      if (!arg) usage("a title is required");
      const [d] = await db.select({ id: dictionaries.id }).from(dictionaries).where(eq(dictionaries.title, arg));
      if (!d || !(await deleteDictionary(db, d.id))) {
        console.error(`no dictionary titled "${arg}"`);
        return 2;
      }
      console.log(`removed "${arg}"`);
      return 0;
    }
    default:
      usage(command ? `unknown command "${command}"` : undefined);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[dict] failed:", err);
    process.exit(1);
  });
