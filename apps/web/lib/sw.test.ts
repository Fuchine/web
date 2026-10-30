import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs public/sw.js in a sandbox with a fake ServiceWorkerGlobalScope and
// checks the caching rules (T3.13): API and page HTML never touch the cache.

const ORIGIN = "https://fuchine.test";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

type Listener = (event: FakeEvent) => void;
interface FakeEvent {
  request?: Request;
  respondWith: (p: Promise<Response>) => void;
  waitUntil: (p: Promise<unknown>) => void;
}

function makeScope(fetchImpl: (req: Request) => Promise<Response>) {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const puts: string[] = [];
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: Request | string) => store.get(typeof req === "string" ? new URL(req, ORIGIN).href : req.url)?.clone(),
      put: async (req: Request, res: Response) => {
        puts.push(req.url);
        store.set(req.url, res);
      },
      addAll: async (reqs: Request[]) => {
        for (const r of reqs) store.set(new URL(r.url, ORIGIN).href, new Response(`precached ${r.url}`));
      },
      keys: async () => [...store.keys()].map((u) => new Request(u)),
      delete: async (req: Request) => store.delete(req.url),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (url: string) => {
      for (const store of stores.values()) {
        const hit = store.get(new URL(url, ORIGIN).href);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  // Request in Node rejects relative URLs; resolve them against the fake origin.
  class SwRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
    }
  }
  runInNewContext(source, { self, caches, fetch: fetchImpl, Request: SwRequest, Response, URL, Promise });

  async function dispatch(type: string, request?: Request) {
    const responded: { p: Promise<Response> | null } = { p: null };
    const waits: Promise<unknown>[] = [];
    listeners[type]!({
      request,
      respondWith: (p) => (responded.p = p),
      waitUntil: (p) => waits.push(p),
    });
    const response: Response | null = responded.p ? await responded.p : null;
    await Promise.all(waits);
    return { responded: response !== null, response };
  }
  return { dispatch, stores, puts, self };
}

const navigate = (path: string) => {
  const req = new Request(ORIGIN + path);
  Object.defineProperty(req, "mode", { value: "navigate" });
  return req;
};

describe("public/sw.js", () => {
  let network: ReturnType<typeof vi.fn<(req: Request) => Promise<Response>>>;
  beforeEach(() => {
    network = vi.fn(async (req: Request) => new Response(`net ${req.url}`, { status: 200 }));
  });

  it("precaches the offline page on install and drops older fuchine caches on activate", async () => {
    const sw = makeScope(network);
    sw.stores.set("fuchine-static-v0", new Map());
    await sw.dispatch("install");
    sw.stores.set("someone-else", new Map());
    await sw.dispatch("activate");
    const names = [...sw.stores.keys()];
    expect(names).toContain("fuchine-static-v1");
    expect(names).not.toContain("fuchine-static-v0");
    expect(names).toContain("someone-else");
    expect(sw.stores.get("fuchine-static-v1")!.has(`${ORIGIN}/offline.html`)).toBe(true);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("never intercepts or caches API requests", async () => {
    const sw = makeScope(network);
    for (const path of ["/api/review/queue", "/api/videos/abc"]) {
      const r = await sw.dispatch("fetch", new Request(ORIGIN + path));
      expect(r.responded).toBe(false);
    }
    const nav = await sw.dispatch("fetch", navigate("/api/export/deck"));
    expect(nav.responded).toBe(false);
    expect(sw.puts).toEqual([]);
  });

  it("serves navigations from the network without storing the HTML", async () => {
    const sw = makeScope(network);
    const r = await sw.dispatch("fetch", navigate("/review"));
    expect(await r.response!.text()).toBe(`net ${ORIGIN}/review`);
    expect(sw.puts).toEqual([]);
  });

  it("falls back to the offline page when a navigation fails", async () => {
    const sw = makeScope(async () => {
      throw new TypeError("offline");
    });
    await sw.dispatch("install");
    const r = await sw.dispatch("fetch", navigate("/review"));
    expect(await r.response!.text()).toContain("/offline.html");
  });

  it("caches hashed build assets cache-first", async () => {
    // A real same-origin fetch yields a "basic" response; Node's is "default".
    const basic = vi.fn(async (req: Request) => {
      const res = new Response(`net ${req.url}`, { status: 200 });
      Object.defineProperty(res, "type", { value: "basic" });
      return res;
    });
    const sw = makeScope(basic);
    const url = `${ORIGIN}/_next/static/chunks/app-abc123.js`;
    const first = await sw.dispatch("fetch", new Request(url));
    const second = await sw.dispatch("fetch", new Request(url));
    expect(await first.response!.text()).toBe(`net ${url}`);
    expect(await second.response!.text()).toBe(`net ${url}`);
    expect(basic).toHaveBeenCalledTimes(1);
    expect(sw.puts).toEqual([url]);
  });

  it("leaves cross-origin, non-GET and RSC requests alone", async () => {
    const sw = makeScope(network);
    const cases = [
      new Request("https://www.youtube.com/iframe_api"),
      new Request(`${ORIGIN}/review`, { method: "POST", body: "x" }),
      new Request(`${ORIGIN}/review?_rsc=1`, { headers: { RSC: "1" } }),
    ];
    for (const req of cases) expect((await sw.dispatch("fetch", req)).responded).toBe(false);
  });
});
