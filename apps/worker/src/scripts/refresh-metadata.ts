// Metadata freshness report (T3.10): videos whose title/channel/duration were
// last captured more than 30 days ago, oldest first, with the watch URL to
// re-open through the extension (a re-import refreshes the row). Never calls
// YouTube. Read-only unless --expire.
//
//   pnpm --filter @fuchine/worker refresh:metadata [--days 30] [--json] [--expire]
//
// --expire clears channel + duration on the stale rows (title, captions and
// study data are kept); the next capture restores them.

import { createDb } from "@fuchine/db";
import { env } from "../env";
import { expireStaleMetadata, listStaleVideos, METADATA_MAX_AGE_DAYS } from "../metadata";

const daysArg = process.argv.indexOf("--days");
const days = daysArg >= 0 ? Number(process.argv[daysArg + 1]) : METADATA_MAX_AGE_DAYS;
if (!Number.isInteger(days) || days < 1) {
  console.error("--days needs a positive integer");
  process.exit(1);
}
const json = process.argv.includes("--json");
const expire = process.argv.includes("--expire");

async function main() {
  const db = createDb(env.databaseUrl, { max: 1 });
  const stale = await listStaleVideos(db, { days });
  if (json) {
    console.log(JSON.stringify(stale.map((v) => ({ ...v, url: `https://www.youtube.com/watch?v=${v.sourceId}` })), null, 2));
  } else {
    console.log(`${stale.length} video(s) with metadata older than ${days} days (oldest first):`);
    for (const v of stale) {
      console.log(`  ${String(v.ageDays).padStart(4)}d  https://www.youtube.com/watch?v=${v.sourceId}  ${v.title}${v.channel ? ` — ${v.channel}` : ""}`);
    }
    if (stale.length > 0 && !expire) {
      console.log("\nRe-open these with the browser extension to re-capture, or run with --expire to clear channel/duration.");
    }
  }
  if (expire) {
    const n = await expireStaleMetadata(db, { days });
    console.log(`expired channel/duration on ${n} video(s)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
