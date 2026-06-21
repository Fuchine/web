/**
 * Runs every end-to-end suite in scripts/e2e-*.ts sequentially against the
 * Postgres at $DATABASE_URL, and aggregates the results. Each suite runs in its
 * own process (they call process.exit) so a crash in one never wedges the rest.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-all.ts
 *
 * For a one-command run that also provisions an ephemeral Postgres, use the
 * wrapper: apps/web/scripts/e2e.sh
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (or use scripts/e2e.sh to provision one)");
  process.exit(1);
}

// Discover suites: every e2e-*.ts except this runner. Sorted for stable order.
const suites = readdirSync(here)
  .filter((f) => f.startsWith("e2e-") && f.endsWith(".ts") && f !== "e2e-all.ts")
  .sort();

const tsx = join(here, "..", "node_modules", ".bin", "tsx");
const results: { suite: string; ok: boolean }[] = [];

for (const suite of suites) {
  console.log(`\n┌─ ${suite} ${"─".repeat(Math.max(0, 50 - suite.length))}`);
  const run = spawnSync(tsx, [join(here, suite)], { stdio: "inherit", env: process.env });
  results.push({ suite, ok: run.status === 0 });
}

console.log(`\n${"═".repeat(56)}`);
console.log("E2E summary");
for (const r of results) console.log(`  ${r.ok ? "✓ PASS" : "✗ FAIL"}  ${r.suite}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${"═".repeat(56)}`);
console.log(`${results.length - failed}/${results.length} suites passed\n`);

process.exit(failed === 0 ? 0 : 1);
