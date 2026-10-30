import { describe, it, expect } from "vitest";
import { AnkiConnectError, pushToAnki, unreachableMessage } from "./anki-connect";

type Call = { action: string; params: Record<string, unknown> };

/** A fake AnkiConnect: answers by action, records the calls. */
function fakeAnki(handlers: Record<string, (p: Record<string, unknown>) => unknown>) {
  const calls: Call[] = [];
  const fetchFn = async (_url: string, init: RequestInit) => {
    const { action, params } = JSON.parse(String(init.body)) as Call;
    calls.push({ action, params });
    const h = handlers[action];
    const body = h ? { result: h(params), error: null } : { result: null, error: `unsupported action ${action}` };
    return new Response(JSON.stringify(body));
  };
  return { calls, fetchFn };
}

const note = (e: string) => ({ guid: `fuchine-${e}`, fields: { Expression: e, ExpressionAudio: "" }, tags: ["fuchine"] });

describe("pushToAnki", () => {
  it("creates the deck and adds the addable notes as Lapis, skipping duplicates", async () => {
    const { calls, fetchFn } = fakeAnki({
      version: () => 6,
      modelNames: () => ["Basic", "Lapis"],
      createDeck: () => 1,
      canAddNotes: (p) => (p.notes as unknown[]).map((_, i) => i !== 1),
      addNotes: (p) => (p.notes as unknown[]).map((_, i) => 100 + i),
    });
    const r = await pushToAnki("Mining", [note("猫"), note("犬"), note("鳥")], fetchFn);
    expect(r).toEqual({ added: 2, skipped: 1 });
    expect(calls.map((c) => c.action)).toEqual(["version", "modelNames", "createDeck", "canAddNotes", "addNotes"]);
    const added = calls.find((c) => c.action === "addNotes")!.params.notes as { deckName: string; modelName: string; fields: Record<string, string> }[];
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ deckName: "Mining", modelName: "Lapis", fields: { Expression: "猫", ExpressionAudio: "" } });
  });

  it("fails clearly when Lapis is not installed", async () => {
    const { fetchFn } = fakeAnki({ version: () => 6, modelNames: () => ["Basic"] });
    await expect(pushToAnki("D", [note("猫")], fetchFn)).rejects.toThrow(/no "Lapis" note type/);
  });

  it("fails clearly when Anki isn't running", async () => {
    const down = async () => { throw new TypeError("Failed to fetch"); };
    await expect(pushToAnki("D", [note("猫")], down)).rejects.toBeInstanceOf(AnkiConnectError);
    expect(unreachableMessage("https://fuchine.example")).toContain('add https://fuchine.example to "webCorsOriginList"');
  });

  it("surfaces AnkiConnect's own errors", async () => {
    const { fetchFn } = fakeAnki({ version: () => 6, modelNames: () => ["Lapis"] });
    await expect(pushToAnki("D", [note("猫")], fetchFn)).rejects.toThrow(/unsupported action createDeck/);
  });
});
