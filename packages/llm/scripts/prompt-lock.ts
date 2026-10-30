// Re-pin src/prompt-version.lock.json to the current prompts.ts + PROMPT_VERSION.
//   pnpm --filter @fuchine/llm prompt:lock
// Refuses when prompts.ts changed but PROMPT_VERSION did not: the point of the
// lock is that a prompt edit cannot ship without a version bump.

import { writeFileSync } from "node:fs";
import {
  LOCK_FILE,
  checkPromptLock,
  readCurrentLockState,
  readLockFile,
  type PromptLock,
} from "../src/prompt-lock";

const current = readCurrentLockState();
let previous: PromptLock | null = null;
try {
  previous = readLockFile();
} catch {
  previous = null; // first lock
}

if (previous) {
  const verdict = checkPromptLock(current, previous);
  if (verdict.ok) {
    console.log(`prompt lock already up to date (v${current.promptVersion}).`);
    process.exit(0);
  }
  if (verdict.reason !== "stale_lock") {
    console.error(`refusing to update the lock: ${verdict.message}`);
    process.exit(1);
  }
}

writeFileSync(LOCK_FILE, JSON.stringify(current, null, 2) + "\n");
console.log(`pinned prompts.ts sha256 ${current.promptsSha256.slice(0, 12)}… to PROMPT_VERSION ${current.promptVersion}.`);
