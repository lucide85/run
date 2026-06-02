import { prisma } from "../db.js";
import { ensureAdminAndBackfill, createUser, getUserByEmail } from "../services/users.js";
import { generatePlan } from "../services/aiPlan.js";

async function main() {
  const admin = await ensureAdminAndBackfill();
  const adminPlan = await prisma.plannedSession.count({ where: { userId: admin.id } });
  const adminWorkouts = await prisma.workout.count({ where: { userId: admin.id } });
  console.log(`Admin (${admin.email}): ${adminPlan} planlagte økter, ${adminWorkouts} importerte økter`);

  // Opprett (eller gjenbruk) testbruker Kari
  const email = "kari@test.no";
  let kari = await getUserByEmail(email);
  if (kari) {
    await prisma.user.delete({ where: { id: kari.id } });
  }
  const created = await createUser(email, "Kari");
  kari = created.user;
  console.log(`\nOpprettet bruker: ${kari.email} / kallenavn "${kari.nickname}" / passord: ${created.password}`);
  console.log(`mustOnboard: ${kari.mustOnboard}`);

  // Generer AI-plan for Kari
  console.log("\nGenererer AI-plan for Kari (10 km om ~12 uker, 3 dager/uke)…");
  const result = await generatePlan(kari, {
    typicalDistanceKm: 4,
    typicalPace: "6:45",
    raceName: "Testløpet",
    raceDate: "2026-08-30",
    raceDistanceKm: 10,
    daysPerWeek: 3,
    maxHr: 188,
    restHr: 52,
    other: "Litt vond i venstre kne av og til.",
  }, true);

  if (result.needMoreInfo) {
    console.log("AI ba om mer info:", result.questions);
    return;
  }
  console.log(`Plan laget: ${result.created} økter. Sammendrag: ${result.summary}`);

  // Kontroller isolasjon
  const kariPlan = await prisma.plannedSession.findMany({ where: { userId: kari.id }, orderBy: { date: "asc" } });
  const kariWorkouts = await prisma.workout.count({ where: { userId: kari.id } });
  const adminPlanAfter = await prisma.plannedSession.count({ where: { userId: admin.id } });
  const refreshedKari = await getUserByEmail(email);

  console.log(`\n--- ISOLASJONSSJEKK ---`);
  console.log(`Kari: ${kariPlan.length} planlagte økter, ${kariWorkouts} importerte økter`);
  console.log(`Kari mustOnboard nå: ${refreshedKari?.mustOnboard}`);
  console.log(`Kari maxHr/restHr: ${refreshedKari?.maxHr}/${refreshedKari?.restHr}, race: ${refreshedKari?.raceName} ${refreshedKari?.raceDate?.toISOString().slice(0,10)}`);
  console.log(`Admin har fortsatt: ${adminPlanAfter} planlagte økter (skal være ${adminPlan}), ${adminWorkouts} økter`);

  console.log(`\nEksempel på Karis 6 første økter:`);
  for (const s of kariPlan.slice(0, 6)) {
    console.log(`  Uke ${s.week} ${s.date.toISOString().slice(0, 10)} [${s.type}] ${s.title} — ${s.targetZone ?? ""}`);
  }
  const last = kariPlan[kariPlan.length - 1];
  console.log(`  …siste: Uke ${last.week} ${last.date.toISOString().slice(0,10)} [${last.type}] ${last.title}`);

  const ok = kariPlan.length > 0 && kariWorkouts === 0 && adminPlanAfter === adminPlan;
  console.log(`\n${ok ? "✅ ISOLASJON OK" : "❌ ISOLASJON FEILET"}`);
}

main()
  .catch((e) => {
    console.error("\n❌ FEIL:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
