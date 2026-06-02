import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loginAndPersist } from "../services/garmin.js";
import { ensureAdminAndBackfill } from "../services/users.js";
import { prisma } from "../db.js";

// Engangs-innlogging mot Garmin. Spør om MFA-kode hvis kontoen krever det.
async function main() {
  const rl = readline.createInterface({ input, output });
  console.log("Logger inn mot Garmin Connect...");
  console.log("(Hvis kontoen din har to-faktor, får du beskjed om å taste inn en kode.)\n");

  const useMfa = (await rl.question("Har kontoen din to-faktor (MFA)? [j/N]: "))
    .trim()
    .toLowerCase();

  let mfaCode: string | undefined;
  if (useMfa === "j" || useMfa === "ja" || useMfa === "y") {
    mfaCode = (await rl.question("Skriv inn MFA-koden fra appen/SMS: ")).trim();
  }
  rl.close();

  try {
    const admin = await ensureAdminAndBackfill();
    await loginAndPersist(admin, mfaCode);
    console.log("\n✅ Innlogging lyktes (admin). Sesjonen er lagret og gjenbrukes ved synk.");
  } catch (e) {
    console.error(`\n❌ Innlogging feilet: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
