import { NextResponse } from "next/server";
import {
  YomitanImportError,
  importYomitanZip,
  maxUncompressedBytesFromEnv,
} from "@fuchine/db/dictionaries";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { adminDenial } from "@/lib/admin";
import { readBodyCapped } from "@/lib/body";
import { listInstalledDictionaries } from "@/lib/dictionaries";

// Admin-only management of imported Yomitan dictionaries (T3.4). The CLI
// (`pnpm --filter @fuchine/worker dict:import`) is the primary path; this is
// the same importer behind the ADMIN_EMAILS gate.

// GET /api/admin/dictionaries — every installed dictionary, disabled included.
export async function GET() {
  const denied = adminDenial(await auth());
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  return NextResponse.json(
    { dictionaries: await listInstalledDictionaries(db, { includeDisabled: true }) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST /api/admin/dictionaries — raw body = the Yomitan .zip
// (Content-Type: application/zip). Re-uploading a title replaces it. The body
// is read only after the admin check and capped at DICT_MAX_UNCOMPRESSED_MB
// (default 200); Caddy caps this one path at 100 MB (every other at 2 MB).
export async function POST(req: Request) {
  const denied = adminDenial(await auth());
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const max = maxUncompressedBytesFromEnv();
  const zip = await readBodyCapped(req, max);
  if (zip === "too_large") {
    return NextResponse.json({ error: "The file is over the size limit." }, { status: 413 });
  }
  if (!zip || zip.length === 0) {
    return NextResponse.json({ error: "Send the dictionary .zip as the request body." }, { status: 400 });
  }
  try {
    const result = await importYomitanZip(db, zip, { maxUncompressedBytes: max });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof YomitanImportError) {
      return NextResponse.json({ error: `Not imported: ${e.message}` }, { status: 422 });
    }
    throw e;
  }
}
