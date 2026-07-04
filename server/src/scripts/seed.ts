import { seedProgram } from "../services/plan.js";
import { ensureAdminAndBackfill } from "../services/users.js";
import { prisma } from "../db.js";

const force = process.argv.includes("--force");
const confirmed = process.argv.includes("--yes-delete-plan");

async function main() {
  const admin = await ensureAdminAndBackfill();

  if (force) {
    // --force sletter hele planen (og, via cascade, AI-meldinger knyttet til
    // planlagte økter). Vis hva som ryker og krev eksplisitt bekreftelse.
    const sessions = await prisma.plannedSession.count({ where: { userId: admin.id } });
    const completed = await prisma.plannedSession.count({
      where: { userId: admin.id, status: "completed" },
    });
    const aiMessages = await prisma.aiMessage.count({
      where: { plannedSession: { userId: admin.id } },
    });
    if (!confirmed && (completed > 0 || aiMessages > 0)) {
      console.error(
        `⛔ --force ville slettet ${sessions} planlagte økter for admin, hvorav ${completed} er FULLFØRTE, ` +
          `pluss ${aiMessages} AI-melding(er) knyttet til dem.\n` +
          `   Er du sikker? Kjør på nytt med BÅDE --force OG --yes-delete-plan.`
      );
      process.exit(1);
    }
  }

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
