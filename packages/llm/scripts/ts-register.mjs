// Run this package's TypeScript sources with plain Node (>=22.18 strips types
// natively) — no tsx/ts-node dependency. Node's ESM resolver wants explicit
// extensions; the sources use extensionless relative imports (bundler style),
// so this hook retries a missing relative specifier with ".ts" / "/index.ts".
//
//   node --import ./scripts/ts-register.mjs eval/explain.ts

import { register } from "node:module";

const hook = `
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!relative || (err?.code !== "ERR_MODULE_NOT_FOUND" && err?.code !== "ERR_UNSUPPORTED_DIR_IMPORT")) throw err;
    for (const suffix of [".ts", "/index.ts"]) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        /* try the next suffix */
      }
    }
    throw err;
  }
}
`;

register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);
