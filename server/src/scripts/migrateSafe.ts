/**
 * Engangs-baseline for Prisma Migrate, kjøres av docker-entrypoint før
 * `prisma migrate deploy`:
 *
 * En database opprettet i «db push»-æraen har alle tabellene, men mangler
 * migreringsbokføringen (_prisma_migrations). Uten baseline ville
 * `migrate deploy` forsøke å kjøre 0_init på nytt og feile på eksisterende
 * tabeller. Her markeres 0_init som allerede utført – det skriver KUN til
 * den nye _prisma_migrations-tabellen og rører ingen data.
 *
 * Idempotent: gjør ingenting på ferske databaser eller når baseline alt er satt.
 */
import { execSync } from "node:child_process";
import { prisma } from "../db.js";

const SCHEMA = process.env.PRISMA_SCHEMA_PATH ?? "server/prisma/schema.prisma";

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('User','_prisma_migrations')"
  );
  const names = new Set(tables.map((t) => t.name));

  if (names.has("User") && !names.has("_prisma_migrations")) {
    console.log(
      "→ Eksisterende database uten migreringshistorikk – markerer 0_init som utført (baseline)…"
    );
    await prisma.$disconnect();
    execSync(`npx prisma migrate resolve --applied 0_init --schema=${SCHEMA}`, {
      stdio: "inherit",
    });
  } else {
    console.log("→ Migreringsstatus OK (ingen baseline nødvendig).");
  }
}

main()
  .catch((e) => {
    console.error("Baseline-sjekk feilet:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
