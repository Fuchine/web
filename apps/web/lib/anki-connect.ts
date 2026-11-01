// "Send to Anki" (T3.3): push Lapis notes straight into the learner's own Anki
// through the AnkiConnect add-on, from the browser — the request goes to
// 127.0.0.1 on the learner's machine, never through our server. A push, never a
// sync: notes are only added, never updated or deleted, and there is no audio
// (D2) — ExpressionAudio/SentenceAudio are sent empty on purpose.
//
// AnkiConnect only answers origins in its `webCorsOriginList`, so a hosted
// instance has to be added there once; the error message says so.

export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export const ANKI_CONNECT_ADDON = "2055492159";

export type LapisNoteJson = { guid: string; fields: Record<string, string>; tags: string[] };

export type PushResult = { added: number; skipped: number };

export class AnkiConnectError extends Error {}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function invoke<T>(fetchFn: Fetch, action: string, params: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw new AnkiConnectError(unreachableMessage());
  }
  let body: { result: T; error: string | null };
  try {
    body = (await res.json()) as { result: T; error: string | null };
  } catch {
    throw new AnkiConnectError(unreachableMessage());
  }
  if (body.error) throw new AnkiConnectError(`AnkiConnect: ${body.error}`);
  return body.result;
}

export function unreachableMessage(origin = typeof location !== "undefined" ? location.origin : ""): string {
  return (
    "Couldn't reach Anki. Open Anki with the AnkiConnect add-on " +
    `(code ${ANKI_CONNECT_ADDON}) installed` +
    (origin ? `, and add ${origin} to "webCorsOriginList" in AnkiConnect's config` : "") +
    ". Some browsers (Safari) block pages from talking to Anki on your computer."
  );
}

/**
 * Add the notes to `deck` with the Lapis note type. Notes Anki reports as
 * duplicates (same Expression in the deck) are skipped, not overwritten.
 */
export async function pushToAnki(
  deck: string,
  notes: LapisNoteJson[],
  fetchFn: Fetch = (u, i) => fetch(u, i),
): Promise<PushResult> {
  await invoke<number>(fetchFn, "version");
  const models = await invoke<string[]>(fetchFn, "modelNames");
  if (!models.includes("Lapis")) {
    throw new AnkiConnectError(
      "Anki has no \"Lapis\" note type. Install it first (import the example deck from donkuri/lapis), then try again.",
    );
  }
  await invoke<number>(fetchFn, "createDeck", { deck });

  const ankiNotes = notes.map((n) => ({
    deckName: deck,
    modelName: "Lapis",
    fields: n.fields,
    tags: n.tags,
    options: { allowDuplicate: false, duplicateScope: "deck" },
  }));
  let added = 0;
  let skipped = 0;
  for (let i = 0; i < ankiNotes.length; i += 100) {
    const batch = ankiNotes.slice(i, i + 100);
    const can = await invoke<boolean[]>(fetchFn, "canAddNotes", { notes: batch });
    const ok = batch.filter((_, j) => can[j]);
    skipped += batch.length - ok.length;
    if (ok.length === 0) continue;
    const ids = await invoke<(number | null)[]>(fetchFn, "addNotes", { notes: ok });
    const n = ids.filter((id) => id != null).length;
    added += n;
    skipped += ok.length - n;
  }
  return { added, skipped };
}
