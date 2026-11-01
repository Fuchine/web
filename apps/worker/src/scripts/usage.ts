// Operator view of today's AI spend (T2.4): house tokens against the daily
// ceiling, split by function, plus BYOK tokens for reference. "Today" is the
// process-local day (TZ), the same boundary the budget uses.
//
//   pnpm --filter @fuchine/worker usage
//   docker compose run --rm worker pnpm --filter @fuchine/worker usage

import { createDb } from "@fuchine/db";
import { budgetState, getSpendToday } from "@fuchine/llm";
import { env } from "../env";

const fmt = (n: number) => n.toLocaleString("en-US");

async function main() {
  const db = createDb(env.databaseUrl, { max: 1 });
  const spend = await getSpendToday(db);
  const limit = env.houseDailyTokens;
  const state = budgetState(spend.house, limit);
  const pct = limit ? ` (${Math.round((100 * spend.house) / limit)}%)` : "";

  console.log(`house tokens today: ${fmt(spend.house)} / ${limit ? fmt(limit) : "unlimited"}${pct} — ${state}`);
  for (const [fn, n] of Object.entries(spend.houseByFn).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fn.padEnd(16)} ${fmt(n)}`);
  }
  console.log(`byok tokens today:  ${fmt(spend.byok)} (users' own keys, not budgeted)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
