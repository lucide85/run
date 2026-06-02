import { getRecentActivities } from "../services/garmin.js";
import { syncGarmin } from "../services/sync.js";
import { ensureAdminAndBackfill } from "../services/users.js";
import { prisma } from "../db.js";

async function main() {
  const admin = await ensureAdminAndBackfill();
  console.log("1) Henter siste aktiviteter fra Garmin…");
  const acts = await getRecentActivities(admin, 5);
  console.log(`   Fikk ${acts.length} aktiviteter.`);
  for (const a of acts.slice(0, 5)) {
    console.log(
      `   - id=${a.activityId} type=${a.activityType?.typeKey} navn="${a.activityName}" start=${a.startTimeLocal} dist=${a.distance}`
    );
  }

  console.log("\n2) Kjører full synk (last ned FIT + parse + lagre)…");
  const result = await syncGarmin(admin.id, 5);
  console.log("   Resultat:", JSON.stringify(result, null, 2));

  console.log("\n3) Lagrede økter i databasen:");
  const workouts = await prisma.workout.findMany({ where: { userId: admin.id }, orderBy: { startTime: "desc" }, take: 5 });
  for (const w of workouts) {
    console.log(
      `   - ${w.startTime.toISOString().slice(0, 10)} ${w.distanceKm}km ${w.durationSec}s avgHr=${w.avgHr} pace=${w.avgPaceSecPerKm}s/km streams=${w.streamsJson ? JSON.parse(w.streamsJson).length : 0}pts`
    );
  }
}

main()
  .catch((e) => {
    console.error("\n❌ FEIL:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
