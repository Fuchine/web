#!/bin/sh
# Restore a custom-format dump produced by pg-backup.sh into a database.
# Companion to scripts/pg-backup.sh — the restore half of the OPS-4 rehearsal.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./scripts/pg-restore.sh <dump>
#
# Restores with --clean --if-exists (drops matching objects first) and
# --no-owner --no-acl (portable into a managed Postgres with a different role).
# Point it at a FRESH / throwaway database for a rehearsal — it overwrites the
# target. After a restore, run `pnpm db:migrate` if the live schema has moved
# past the dump. The BYOK ciphertext only decrypts with the SAME
# FUCHINE_ENCRYPTION_KEY that was set when the dump was taken.
set -eu

DUMP=${1:-}
if [ -z "$DUMP" ]; then
	echo "usage: DATABASE_URL=... $0 <dump-file>" >&2
	exit 2
fi
if [ -z "${DATABASE_URL:-}" ]; then
	echo "error: DATABASE_URL is not set" >&2
	exit 2
fi
if [ ! -f "$DUMP" ]; then
	echo "error: dump not found: $DUMP" >&2
	exit 2
fi

echo "[restore] pg_restore $DUMP -> $DATABASE_URL"
pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" "$DUMP"
echo "[restore] done. If the live schema moved on, run: pnpm db:migrate"
