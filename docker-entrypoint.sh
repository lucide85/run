#!/bin/sh
set -e

# Sørg for at databasemappa finnes (mountes som volum)
mkdir -p /app/server/prisma/data

DATA_DIR=/app/server/prisma/data
DB="$DATA_DIR/treningsapp.db"

# Automatisk sikkerhetskopi FØR skjemaendringer. Serveren har ikke startet
# ennå, så databasen er i ro og kopien er garantert konsistent.
if [ -f "$DB" ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  echo "→ Tar sikkerhetskopi av databasen: backup-$ts.db"
  cp "$DB" "$DATA_DIR/backup-$ts.db"
  # Ta med ev. journal/WAL-filer fra en brå stopp, så paret er komplett
  [ -f "$DB-wal" ] && cp "$DB-wal" "$DATA_DIR/backup-$ts.db-wal" || true
  [ -f "$DB-journal" ] && cp "$DB-journal" "$DATA_DIR/backup-$ts.db-journal" || true
  # Behold de 7 nyeste kopiene
  ls -1t "$DATA_DIR"/backup-*.db 2>/dev/null | tail -n +8 | while read -r f; do
    rm -f "$f" "$f-wal" "$f-journal"
  done
fi

# Engangs: databaser fra «db push»-æraen får migreringshistorikken markert (baseline).
node server/dist/scripts/migrateSafe.js

# Kjør ventende migreringer. I motsetning til «db push --accept-data-loss»
# feiler dette HØYT hvis noe ville vært destruktivt – data slettes aldri stille.
echo "→ Kjører databasemigreringer (prisma migrate deploy)…"
npx prisma migrate deploy --schema=server/prisma/schema.prisma

echo "→ Starter Treningsapp…"
exec node server/dist/index.js
