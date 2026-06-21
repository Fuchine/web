#!/usr/bin/env bash
# One-command end-to-end run.
#
# If $DATABASE_URL points at a reachable Postgres, it's used as-is. Otherwise an
# ephemeral Postgres cluster is provisioned in a temp dir, migrated, used for the
# suites, and torn down on exit. Works as root (runs the server as the postgres
# user) or as a normal user.
#
#   apps/web/scripts/e2e.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

run_suites() {
  echo "==> running E2E suites against $DATABASE_URL"
  ( cd "$ROOT" && DATABASE_URL="$DATABASE_URL" pnpm --filter @fuchine/web exec tsx scripts/e2e-all.ts )
}

# --- Use an existing DB if one is reachable ---
if [ -n "${DATABASE_URL:-}" ] && pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  run_suites
  exit $?
fi

# --- Otherwise provision an ephemeral cluster ---
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "Postgres binaries not found (initdb)"; exit 1; }

PGDATA="$(mktemp -d)"
PGPORT="${PGPORT:-54329}"
PGSOCK="$PGDATA"

# initdb/pg_ctl refuse to run as root — shell out to the postgres user when root.
AS_PG=""
if [ "$(id -u)" = "0" ]; then
  AS_PG="su postgres -c"
  chown -R postgres:postgres "$PGDATA"
fi
# su starts a fresh shell that drops our PATH, so carry the pg bin dir in.
runpg() {
  local cmd="export PATH=\"$PGBIN:\$PATH\"; $1"
  if [ -n "$AS_PG" ]; then su postgres -c "$cmd"; else bash -c "$cmd"; fi
}

cleanup() {
  runpg "pg_ctl -D '$PGDATA' stop -m fast" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> provisioning ephemeral Postgres in $PGDATA (port $PGPORT)"
runpg "initdb -D '$PGDATA' -U fuchine --auth=trust" >/dev/null
runpg "pg_ctl -D '$PGDATA' -o '-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1' -l '$PGDATA/server.log' start" >/dev/null
for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break; sleep 0.5; done
runpg "createdb -h 127.0.0.1 -p $PGPORT -U fuchine fuchine"

export DATABASE_URL="postgres://fuchine@127.0.0.1:$PGPORT/fuchine"

echo "==> applying migrations"
( cd "$ROOT" && DATABASE_URL="$DATABASE_URL" pnpm --filter @fuchine/db migrate >/dev/null )

run_suites
