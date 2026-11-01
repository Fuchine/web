// Operator CLI for registration invites (T2.3). Invites are e-mail-bound,
// single use and expiring; see docs/plans/2026-10-30-registration-control-spec.md.
//
//   pnpm --filter @fuchine/worker invite add friend@example.com [--days 14] [--note "..."]
//   pnpm --filter @fuchine/worker invite list [--all]
//   pnpm --filter @fuchine/worker invite revoke friend@example.com
//
// In compose: docker compose run --rm worker pnpm --filter @fuchine/worker invite add <email>
// Exit codes: 0 ok · 1 usage error · 2 nothing to revoke.

import { parseArgs } from "node:util";
import {
  addInvite,
  createDb,
  listInvites,
  normalizeEmail,
  revokeInvite,
  type Invite,
} from "@fuchine/db";
import { env } from "../env";

const USAGE = `usage:
  invite add <email> [--days N] [--note TEXT]
  invite list [--all]
  invite revoke <email>`;

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error(USAGE);
  process.exit(1);
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function describeInvite(i: Invite, now = new Date()): string {
  const state = i.usedAt
    ? `used ${day(i.usedAt)}${i.usedBy ? ` by ${i.usedBy}` : ""}`
    : i.expiresAt <= now
      ? "expired"
      : "active";
  const note = i.note ? ` · ${i.note}` : "";
  return `${i.email} · expires ${day(i.expiresAt)} · ${state}${note}`;
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      days: { type: "string", default: "14" },
      note: { type: "string" },
      all: { type: "boolean", default: false },
    },
  });
  const [command, rawEmail] = positionals;
  const db = createDb(env.databaseUrl, { max: 1 });

  switch (command) {
    case "add": {
      const email = normalizeEmail(rawEmail);
      if (!email) usage("a valid e-mail is required");
      const days = Number(values.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) usage("--days must be an integer from 1 to 365");
      const invite = await addInvite(db, { email, days, note: values.note ?? null, createdBy: "cli" });
      console.log(describeInvite(invite));
      return 0;
    }
    case "list": {
      const rows = await listInvites(db, { all: values.all });
      if (rows.length === 0) console.log(values.all ? "no invites" : "no active invites");
      for (const r of rows) console.log(describeInvite(r));
      return 0;
    }
    case "revoke": {
      const email = normalizeEmail(rawEmail);
      if (!email) usage("a valid e-mail is required");
      const n = await revokeInvite(db, email);
      if (n === 0) {
        console.error(`no unused invite for ${email}`);
        return 2;
      }
      console.log(`revoked invite for ${email}`);
      return 0;
    }
    default:
      usage(command ? `unknown command "${command}"` : undefined);
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
