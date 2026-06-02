import { prisma } from "../db.js";
import { getRecentActivities, downloadAndParse } from "./garmin.js";
import { getUserById } from "./users.js";
import type { ParsedWorkout } from "./fit.js";

export interface SyncResult {
  imported: number;
  skipped: number;
  matched: number;
  errors: string[];
}

/** Henter nye aktiviteter fra Garmin for en bruker, lagrer og kobler til planlagte økter. */
export async function syncGarmin(userId: number, limit = 20): Promise<SyncResult> {
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
      const parsed = await downloadAndParse(user, act);
      const workout = await storeWorkout(userId, garminActivityId, act, parsed, typeKey);
      result.imported++;
      const matched = await matchToPlanned(userId, workout.id, parsed.startTime);
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

/** Koble en økt til nærmeste ukoblede planlagte økt (samme bruker) innen ±2 dager. */
export async function matchToPlanned(userId: number, workoutId: number, when: Date): Promise<boolean> {
  const dayMs = 24 * 60 * 60 * 1000;
  const from = new Date(when.getTime() - 2 * dayMs);
  const to = new Date(when.getTime() + 2 * dayMs);

  const candidates = await prisma.plannedSession.findMany({
    where: { userId, workoutId: null, date: { gte: from, lte: to }, type: { not: "race" } },
  });
  if (candidates.length === 0) return false;

  candidates.sort(
    (a, b) => Math.abs(a.date.getTime() - when.getTime()) - Math.abs(b.date.getTime() - when.getTime())
  );

  await prisma.plannedSession.update({
    where: { id: candidates[0].id },
    data: { workoutId, status: "completed" },
  });
  return true;
}
