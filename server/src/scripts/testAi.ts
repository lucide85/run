import { prisma } from "../db.js";
import {
  evaluateWorkout,
  chatAboutWorkout,
  proposePlanAdjustment,
  summarizeWorkout,
} from "../services/ai.js";
import { ensureAdminAndBackfill } from "../services/users.js";

async function main() {
  const admin = await ensureAdminAndBackfill();
  const workout = await prisma.workout.findFirst({
    where: { userId: admin.id },
    orderBy: { startTime: "desc" },
    include: { plannedSession: true },
  });
  if (!workout) {
    console.log("Ingen økter i databasen — kjør synk først.");
    return;
  }

  console.log(`Tester AI mot økt ${workout.startTime.toISOString().slice(0, 10)} (${workout.distanceKm}km)\n`);

  console.log("1) ØKTVURDERING…");
  const recent = await prisma.workout.findMany({ where: { userId: admin.id }, orderBy: { startTime: "desc" }, take: 4 });
  const history = recent.filter((w) => w.id !== workout.id).map((w) => summarizeWorkout(w)).join("\n---\n");
  const feedback = await evaluateWorkout(admin, workout, workout.plannedSession, history);
  console.log(feedback);

  console.log("\n2) OPPFØLGINGSSPØRSMÅL: «Lå jeg for hardt på denne økten?»");
  const reply = await chatAboutWorkout(admin, workout, workout.plannedSession, [
    { role: "user", content: "Lå jeg for hardt på denne økten?" },
  ]);
  console.log(reply);

  console.log("\n3) PLANTILPASNING (forslag på kommende økter)…");
  const upcoming = await prisma.plannedSession.findMany({
    where: { userId: admin.id, status: { in: ["planned", "moved"] } },
    orderBy: { date: "asc" },
    take: 6,
  });
  const proposal = await proposePlanAdjustment(admin, upcoming, history);
  console.log("Sammendrag:", proposal.summary);
  console.log("Antall foreslåtte endringer:", proposal.changes.length);
  for (const c of proposal.changes) {
    console.log(`  #${c.sessionId} ${c.field}: "${c.before}" → "${c.after}" (${c.reason})`);
  }

  console.log("\n✅ Alle tre AI-funksjonene svarte uten feil.");
}

main()
  .catch((e) => {
    console.error("\n❌ AI-FEIL:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
