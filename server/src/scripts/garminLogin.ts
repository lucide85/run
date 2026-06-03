import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loginAndPersist } from "../services/garmin.js";
import { ensureAdminAndBackfill } from "../services/users.js";
import { prisma } from "../db.js";

// Engangs-innlogging mot Garmin. Spør om MFA-kode hvis kontoen krever det.
async function main() {
  const rl = readline.createInterface({ input, output });
  console.log("Logger inn mot Garmin Connect...");
  console.log("(Hvis kontoen din har to-faktor, blir du bedt om å taste inn koden underveis.)\n");

  try {
    const admin = await ensureAdminAndBackfill();
    await loginAndPersist(admin, async () =>
      (await rl.question("Skriv inn sikkerhetskoden fra e-post/SMS/app: ")).trim()
    );
    console.log("\n✅ Innlogging lyktes (admin). Sesjonen er lagret og gjenbrukes ved synk.");
  } catch (e) {
    console.error(`\n❌ Innlogging feilet: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();
