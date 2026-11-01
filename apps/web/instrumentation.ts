// Next.js instrumentation hook: runs once when the server process starts.
//
// Next compiles this file for BOTH the Node.js and the edge runtime. Anything
// that pulls Node built-ins (`node:crypto` via @fuchine/llm, `pg` via the db)
// must live in a separate module imported only inside the NEXT_RUNTIME branch,
// so webpack never bundles it for the edge build (otherwise `next dev` 500s
// every page with `UnhandledSchemeError: Reading from "node:crypto"`).
// The boot checks themselves are in instrumentation-node.ts.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
