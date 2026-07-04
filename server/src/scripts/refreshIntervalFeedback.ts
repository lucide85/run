/**
 * Regenerer AI-vurderingen for allerede fullførte INTERVALL-/kvalitetsøkter,
 * nå som vurderingen forstår drag/pauser og ikke lenger dømmer økten på
 * snittpulsen for hele økten.
 *
 * - Gjelder økter koblet til en planlagt økt med type "quality" som allerede
 *   har fått AI-vurdering («feedback»).
 * - Den gamle vurderingen beholdes i historikken; en ny, oppdatert vurdering
 *   legges til under. Kjøres scriptet på nytt hoppes allerede oppdaterte over.
 *
 * Bruk:
 *   npm -w server run refresh:interval-feedback              (alle brukere)
 *   npm -w server run refresh:interval-feedback -- --dry-run (vis hva som ville skjedd)
 *   npm -w server run refresh:interval-feedback -- --user epost@example.com
 *
 * I Docker-produksjon:
 *   docker compose exec treningsapp node server/dist/scripts/refreshIntervalFeedback.js
 */
import { prisma } from "../db.js";
import { evaluateWorkout } from "../services/ai.js";
import { recentHistory } from "../services/history.js";

const MARKER = "Oppdatert vurdering med intervallanalyse";
const dryRun = process.argv.includes("--dry-run");
const userArgIdx = process.argv.indexOf("--user");
const userEmail = userArgIdx >= 0 ? process.argv[userArgIdx + 1] : null;

async function main() {
  const users = await prisma.user.findMany({
    where: userEmail ? { email: userEmail.trim().toLowerCase() } : {},
  });
  if (users.length === 0) {
    console.error(userEmail ? `Fant ingen bruker med e-post ${userEmail}` : "Ingen brukere.");
    process.exit(1);
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    // Intervall-/kvalitetsøkter med eksisterende AI-vurdering
    const sessions = await prisma.plannedSession.findMany({
      where: { userId: user.id, type: "quality", workoutId: { not: null } },
      include: { workout: { include: { aiMessages: true } } },
      orderBy: { date: "asc" },
    });

    for (const s of sessions) {
      const w = s.workout;
      if (!w) continue;
      const hasFeedback = w.aiMessages.some((m) => m.kind === "feedback");
      if (!hasFeedback) {
        skipped++;
        continue; // aldri vurdert – brukeren kan be om vurdering i appen
      }
      const alreadyRefreshed = w.aiMessages.some((m) => m.content.includes(MARKER));
      if (alreadyRefreshed) {
        skipped++;
        continue;
      }

      const label = `${user.nickname}: uke ${s.week} «${s.title}» (${w.startTime.toISOString().slice(0, 10)})`;
      if (dryRun) {
        console.log(`[dry-run] Ville oppdatert: ${label}`);
        refreshed++;
        continue;
      }

      try {
        const history = await recentHistory(user, w.id);
        const feedback = await evaluateWorkout(user, w, s, history);
        await prisma.aiMessage.create({
          data: {
            workoutId: w.id,
            role: "assistant",
            content: `_🔁 ${MARKER} – dragene og pausene vurderes nå hver for seg:_\n\n${feedback}`,
            kind: "feedback",
          },
        });
        refreshed++;
        console.log(`✅ Oppdatert: ${label}`);
      } catch (e) {
        failed++;
        console.error(`❌ Feilet: ${label} – ${(e as Error).message}`);
      }
    }
  }

  console.log(
    `\nFerdig: ${refreshed} ${dryRun ? "ville blitt " : ""}oppdatert, ${skipped} hoppet over, ${failed} feilet.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
