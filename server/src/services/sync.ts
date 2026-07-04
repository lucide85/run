import { prisma } from "../db.js";
import { getRecentActivities, downloadAndParse } from "./garmin.js";
import { getUserById } from "./users.js";
import { computeZones } from "../data/program.js";
import { osloDayKeyMs, osloNoon } from "../lib/dates.js";
import type { ParsedWorkout } from "./fit.js";

export interface SyncResult {
  imported: number;
  skipped: number;
  matched: number;
  errors: string[];
}

// Én synk om gangen per bruker: et dobbeltklikk/overlappende kall gjenbruker
// den pågående synken i stedet for å kappløpe om de samme aktivitetene.
const runningSyncs = new Map<number, Promise<SyncResult>>();

/** Henter nye aktiviteter fra Garmin for en bruker, lagrer og kobler til planlagte økter. */
export function syncGarmin(userId: number, limit = 20): Promise<SyncResult> {
  const existing = runningSyncs.get(userId);
  if (existing) return existing;
  const p = doSync(userId, limit).finally(() => runningSyncs.delete(userId));
  runningSyncs.set(userId, p);
  return p;
}

async function doSync(userId: number, limit: number): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, skipped: 0, matched: 0, errors: [] };
  const user = await getUserById(userId);
  if (!user) throw new Error("Bruker finnes ikke");

  const activities = await getRecentActivities(user, limit);

  // Aktiviteter brukeren har slettet/ignorert – skal ikke importeres på nytt
  const ignored = new Set(
    (await prisma.ignoredActivity.findMany({ where: { userId }, select: { garminActivityId: true } })).map(
      (i) => i.garminActivityId
    )
  );

  for (const act of activities) {
    const garminActivityId = String(act.activityId);
    if (ignored.has(garminActivityId)) {
      result.skipped++;
      continue;
    }
    const existing = await prisma.workout.findFirst({ where: { userId, garminActivityId } });
    if (existing) {
      result.skipped++;
      continue;
    }
    const typeKey = act.activityType?.typeKey ?? "";
    try {
      // Brukerens egne pulssoner styrer tid-i-sone-fordelingen som lagres.
      const parsed = await downloadAndParse(user, act, computeZones(user.maxHr, user.restHr));
      const workout = await storeWorkout(userId, garminActivityId, act, parsed, typeKey);
      result.imported++;
      const matched = await matchToPlanned(userId, workout.id, parsed.startTime, parsed.distanceKm ?? null);
      if (matched) result.matched++;
    } catch (e) {
      result.errors.push(`${garminActivityId}: ${(e as Error).message}`);
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { lastGarminSync: new Date() } });
  return result;
}

async function storeWorkout(
  userId: number,
  garminActivityId: string,
  act: { activityName?: string },
  p: ParsedWorkout,
  typeKey: string
) {
  return prisma.workout.create({
    data: {
      userId,
      garminActivityId,
      startTime: p.startTime,
      sport: p.sport ?? typeKey,
      name: act.activityName ?? null,
      distanceKm: p.distanceKm ?? null,
      durationSec: p.durationSec ?? null,
      avgHr: p.avgHr ?? null,
      maxHr: p.maxHr ?? null,
      avgPaceSecPerKm: p.avgPaceSecPerKm ?? null,
      elevationGainM: p.elevationGainM ?? null,
      avgCadence: p.avgCadence ?? null,
      calories: p.calories ?? null,
      hrZoneSecondsJson: JSON.stringify(p.hrZoneSeconds),
      streamsJson: JSON.stringify(downsample(p.streams)),
      lapsJson: JSON.stringify(p.laps),
      rawType: typeKey,
    },
  });
}

function downsample<T>(arr: T[], target = 600): T[] {
  if (arr.length <= target) return arr;
  const step = Math.ceil(arr.length / target);
  return arr.filter((_, i) => i % step === 0);
}

/**
 * Koble en økt til en ukoblet planlagt økt (samme bruker) innen ±2 dager.
 * Prioritering: (1) samme dag som økten, deretter nærmeste dag; (2) ved flere
 * kandidater like nær i tid – den hvis planlagte distanse passer best med faktisk distanse.
 * Brukeren kan uansett overstyre manuelt etterpå.
 */
export async function matchToPlanned(
  userId: number,
  workoutId: number,
  when: Date,
  distanceKm: number | null = null
): Promise<boolean> {
  const dayMs = 24 * 60 * 60 * 1000;
  const from = new Date(when.getTime() - 2 * dayMs);
  const to = new Date(when.getTime() + 2 * dayMs);

  // Bare økter som fortsatt venter: en økt brukeren har hoppet over eller
  // manuelt fullført skal IKKE stjeles av auto-matchingen.
  const candidates = await prisma.plannedSession.findMany({
    where: {
      userId,
      workoutId: null,
      status: { in: ["planned", "moved"] },
      date: { gte: from, lte: to },
      type: { not: "race" },
    },
  });
  if (candidates.length === 0) return false;

  // Antall hele kalenderdager mellom planlagt dag og øktens dag (0 = samme dag),
  // regnet i norsk lokaltid – en økt løpt 00:30 lørdag skal telle som lørdag.
  const workoutDay = osloDayKeyMs(when);
  const dayDiff = (d: Date) => Math.abs((osloDayKeyMs(d) - workoutDay) / dayMs);
  // Avvik mellom planlagt og faktisk distanse (ukjent planlagt distanse rangeres sist).
  const distDiff = (planned: number | null) =>
    planned != null && distanceKm != null ? Math.abs(planned - distanceKm) : Number.POSITIVE_INFINITY;

  candidates.sort((a, b) => {
    const dd = dayDiff(a.date) - dayDiff(b.date); // 1) samme/nærmeste dag
    if (dd !== 0) return dd;
    return distDiff(a.plannedDistanceKm) - distDiff(b.plannedDistanceKm); // 2) best distansematch
  });

  // Fullført-datoen settes til datoen økten FAKTISK ble gjennomført (ikke planlagt dag).
  // Normaliser til kl 12 UTC på den NORSKE kalenderdagen (appens datokonvensjon).
  const doneDate = osloNoon(when);

  // Atomisk kobling: to samtidige økter kan ellers velge samme kandidat, der
  // den siste stille overskriver den førstes kobling.
  for (const candidate of candidates) {
    const linked = await prisma.plannedSession.updateMany({
      where: { id: candidate.id, workoutId: null },
      data: { workoutId, status: "completed", date: doneDate },
    });
    if (linked.count > 0) return true;
  }
  return false;
}
