import { seedProgram } from "../services/plan.js";
import { ensureAdminAndBackfill } from "../services/users.js";
import { prisma } from "../db.js";

const force = process.argv.includes("--force");

async function main() {
  const admin = await ensureAdminAndBackfill();
  const created = await seedProgram(admin.id, force);
  if (created > 0) {
    console.log(`✅ Seedet ${created} planlagte økter for admin (${admin.email}).`);
  } else {
    console.log("ℹ️  Admin har allerede en plan (bruk --force for å regenerere).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
