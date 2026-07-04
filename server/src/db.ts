import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * SQLite-innstillinger for jevn drift: WAL lar lesing skje samtidig som en
 * Garmin-synk skriver (unngår «database is locked»), og busy_timeout gjør at
 * korte kollisjoner venter i stedet for å feile. WAL er en varig, fullt
 * reverserbar egenskap ved databasefilen – ingen data endres.
 */
export async function initDb(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  } catch (e) {
    console.warn("⚠️  Kunne ikke sette SQLite-pragmas (fortsetter):", e);
  }
}
