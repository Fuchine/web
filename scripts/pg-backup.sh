#!/bin/sh
# Daily pg_dump loop for the compose `db-backup` sidecar. Writes compressed
# custom-format dumps to /backups and keeps the 7 most recent. Restore with:
#   pg_restore -d "$DATABASE_URL" --clean --if-exists /backups/<file>.dump
# (into a fresh DB, then `pnpm db:migrate` if the schema has moved on).
set -eu

BACKUP_DIR=/backups
RETENTION=${BACKUP_RETENTION:-7}
INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}

mkdir -p "$BACKUP_DIR"

while true; do
	ts=$(date +%Y%m%d-%H%M%S)
	out="$BACKUP_DIR/fuchine-$ts.dump"
	echo "[backup] pg_dump -> $out"
	if pg_dump -Fc "$DATABASE_URL" >"$out.tmp"; then
		mv "$out.tmp" "$out"
		# Retention: delete all but the newest $RETENTION dumps.
		ls -1t "$BACKUP_DIR"/fuchine-*.dump 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
			echo "[backup] pruning $old"
			rm -f "$old"
		done
	else
		echo "[backup] pg_dump FAILED (will retry next cycle)" >&2
		rm -f "$out.tmp"
	fi
	sleep "$INTERVAL"
done
