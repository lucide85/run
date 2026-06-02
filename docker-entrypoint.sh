#!/bin/sh
set -e

# Sørg for at databasemappa finnes (mountes som volum)
mkdir -p /app/server/prisma/data

# Opprett/oppdater databaseskjemaet på volumet (idempotent)
echo "→ Synkroniserer databaseskjema (prisma db push)…"
npx prisma db push --schema=server/prisma/schema.prisma --skip-generate --accept-data-loss

echo "→ Starter Treningsapp…"
exec node server/dist/index.js
