import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BAD, GOOD } from "./__fixtures__/outputs";
import { parseGoldSet } from "./gold";
import { renderReport, reportFileName, summarize } from "./report";
import { createProviderSubject, runEval, type EvalSubject } from "./runner";

const GOLD = parseGoldSet(
  [
    '{"_meta":{"status":"unreviewed","note":"Seed set written by an AI assistant — must be reviewed by a human before results are trusted; target ~200 items."}}',
    '{"id":"wa-ga-02","topic":"は vs が","line":"象は鼻が長い。","expect":{"mustMentionInBreakdown":["は","が"],"mustNotContain":["がは"]}}',
    '{"id":"teiru-01","topic":"ている","line":"今、ご飯を食べている。","expect":{"mustMentionInBreakdown":["食べて"]}}',
    '{"id":"noise-01","topic":"noise","line":"♪～","expect":{"emptyBreakdown":true}}',
  ].join("\n"),
);

/** Fake subject: canned raw output per line, or a thrown error. */
function fakeSubject(byLine: Record<string, string | Error>): EvalSubject {
  return {
    provider: "fake",
    model: "fake/model:1",
    async explainRaw(ctx) {
      const v = byLine[ctx.text];
      if (v instanceof Error) throw v;
      return { raw: v ?? null, error: v ? undefined : "no fixture" };
    },
  };
}

describe("runEval with a fake provider", () => {
  it("grades each item, keeps order, separates errors from failures", async () => {
    const results = await runEval(
      GOLD.items,
      fakeSubject({
        "象は鼻が長い。": BAD.hallucinated,
        "今、ご飯を食べている。": GOOD["teiru-01"]!,
        "♪～": new Error("Provider error 503"),
      }),
      { concurrency: 3 },
    );
    expect(results.map((r) => [r.id, r.pass, r.errored])).toEqual([
      ["wa-ga-02", false, false],
      ["teiru-01", true, false],
      ["noise-01", false, true],
    ]);

    const s = summarize(results);
    expect(s).toMatchObject({ total: 3, completed: 2, errored: 1, passed: 1 });
    expect(s.passRateCompleted).toBe(0.5);
  });

  it("renders a markdown report with the unreviewed warning and per-item rows", async () => {
    const results = await runEval(GOLD.items, fakeSubject({
      "象は鼻が長い。": GOOD["wa-ga-02"]!,
      "今、ご飯を食べている。": BAD.prose,
      "♪～": GOOD["noise-01"]!,
    }));
    const md = renderReport(results, {
      date: "2026-10-30",
      startedAt: "2026-10-30T00:00:00.000Z",
      provider: "fake",
      model: "fake/model:1",
      promptVersion: 2,
      promptsSha256: "a".repeat(64),
      goldFile: "eval/gold/test.jsonl",
      goldSha256: "b".repeat(64),
      goldMeta: GOLD.meta,
    });
    expect(md).toMatch(/Unreviewed gold set/);
    expect(md).toMatch(/Items passing every check: 2\/3 \(66\.7%\)/);
    expect(md).toMatch(/\| FAIL \| `teiru-01` \|.*json_valid/);
    expect(md).toMatch(/Raw output of failing items/);
    expect(reportFileName("2026-10-30", "fake/model:1", 2)).toBe("2026-10-30-fake_model_1-v2.md");
  });
});

describe("createProviderSubject (production provider, stubbed network)", () => {
  const realFetch = globalThis.fetch;
  let bodies: string[];

  beforeEach(() => {
    bodies = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function stubChat(contentFor: (userMsg: string) => string | { status: number }) {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
      bodies.push(String(init?.body));
      const user = body.messages.find((m) => m.role === "user")!.content;
      const c = contentFor(user);
      if (typeof c !== "string") return new Response("boom", { status: c.status });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: c } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
  }

  it("captures the raw content (even invalid JSON), sums usage, and sends production's prompt", async () => {
    stubChat((user) => {
      if (user.includes("象は")) return BAD.schemaDrift;
      if (user.includes("食べている")) return BAD.prose; // provider throws on parse; we still grade it
      return { status: 500 };
    });
    const subject = createProviderSubject({
      provider: "openai-compatible",
      baseUrl: "http://fake.local/v1",
      model: "fake-m1",
      apiKey: "test-key",
    });
    const results = await runEval(GOLD.items, subject, { concurrency: 3 });

    expect(results[0]!.raw).toBe(BAD.schemaDrift);
    expect(results[0]!.checks.find((c) => c.name === "no_coercion_loss")?.pass).toBe(false);
    expect(results[1]!.raw).toBe(BAD.prose);
    expect(results[1]!.checks[0]).toMatchObject({ name: "json_valid", pass: false });
    expect(results[2]).toMatchObject({ errored: true });
    expect(results[2]!.error).toMatch(/500/);

    expect(subject.usage.calls).toBe(3);
    expect(subject.usage.inTokens).toBe(200); // the 500 call has no usage
    expect(bodies[0]).toMatch(/breakdown/); // buildExplainMessages system prompt
    expect(JSON.parse(bodies[0]!).model).toBe("fake-m1");
  });
});
