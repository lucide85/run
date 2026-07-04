import type { PlannedSession, User, Workout } from "@prisma/client";
import { prisma } from "../db.js";
import { computeZones } from "../data/program.js";
import type { ZoneDef } from "./fit.js";
import { summarizeWorkout } from "./ai.js";
import {
  classifyLaps,
  parseLapsJson,
  secondsInTargetZones,
  targetZoneNumbers,
  workSummary,
  zoneSecondsFromStreams,
} from "./intervals.js";

const fmtPace = (s?: number | null) =>
  s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "?";
const fmtDur = (s?: number | null) =>
  s || s === 0 ? `${Math.floor((s ?? 0) / 60)}:${String((s ?? 0) % 60).padStart(2, "0")}` : "?";

/** Kort historikk fra brukerens siste økter (ekskl. en gitt økt). */
export async function recentHistory(user: User, excludeWorkoutId?: number): Promise<string> {
  const zones = computeZones(user.maxHr, user.restHr);
  const recent = await prisma.workout.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "desc" },
    take: 6,
  });
  return recent
    .filter((w) => w.id !== excludeWorkoutId)
    .slice(0, 5)
    .map((w) => summarizeWorkout(w, zones))
    .join("\n---\n");
}

/**
 * Intervall-tillegg for en kvalitetsøkt: «drag: 5×3:00 @ 5:52/km, puls 172»
 * eller «≈14 min i sone 4+». Tom streng når det ikke er relevant/beregnbart.
 * Uten dette dømmes intervalløkter på snittpuls for hele økten – som pausene
 * naturlig trekker ned.
 */
export function qualitySuffix(
  session: Pick<PlannedSession, "type" | "targetZone">,
  workout: Workout | null,
  zones: ZoneDef[]
): string {
  if (session.type !== "quality" || !workout) return "";

  const ws = workSummary(classifyLaps(parseLapsJson(workout.lapsJson)));
  if (ws) {
    return (
      `, drag: ${ws.count}×${fmtDur(ws.avgWorkDurationSec)}` +
      ` @ ${fmtPace(ws.avgWorkPaceSecPerKm)}/km, puls i drag ${ws.avgWorkHr ?? "?"}`
    );
  }

  const tz = targetZoneNumbers(session.targetZone);
  if (tz.length === 0) return "";
  const minZone = Math.min(...tz);

  // Helst tid-i-sone beregnet med brukerens soner fra strømmen; ellers lagret fordeling.
  const recomputed = zoneSecondsFromStreams(workout.streamsJson, zones);
  let inTarget: number | null = null;
  if (recomputed) {
    inTarget = 0;
    for (const [zone, sec] of Object.entries(recomputed)) {
      if (Number(zone) >= minZone) inTarget += sec;
    }
    inTarget = Math.round(inTarget);
  } else {
    inTarget = secondsInTargetZones(workout.hrZoneSecondsJson, tz);
  }
  if (inTarget == null) return "";
  return `, ≈${Math.round(inTarget / 60)} min i sone ${minZone}+`;
}

/** Planlagt-vs-faktisk for HELE treningsperioden – grunnlag for AI-tilpasning. */
export async function periodComparison(user: User): Promise<string> {
  const zones = computeZones(user.maxHr, user.restHr);
  const sessions = await prisma.plannedSession.findMany({
    where: { userId: user.id, status: { in: ["completed", "skipped"] } },
    orderBy: { date: "asc" },
    include: { workout: true },
  });
  if (sessions.length === 0) return "(ingen gjennomførte økter ennå)";

  return sessions
    .map((s) => {
      const plan =
        `planlagt: ${s.targetZone ?? "sone ?"}` +
        `${s.targetPaceMinSec ? `, ${fmtPace(s.targetPaceMinSec)}–${fmtPace(s.targetPaceMaxSec)}/km` : ""}` +
        `${s.plannedDistanceKm ? `, ${s.plannedDistanceKm} km` : ""}`;
      const head = `Uke ${s.week} [${s.type}] ${s.title}`;
      if (s.status === "skipped") return `${head}: HOPPET OVER (${plan})`;
      const w = s.workout;
      const act = w
        ? `faktisk: ${w.distanceKm?.toFixed(2) ?? "?"} km @ ${fmtPace(w.avgPaceSecPerKm)}/km, snittpuls ${w.avgHr ?? "?"}${w.maxHr ? `/maks ${w.maxHr}` : ""}${qualitySuffix(s, w, zones)}`
        : "faktisk: (fullført, men ingen øktdata)";
      return `${head}: ${plan} → ${act}`;
    })
    .join("\n");
}
