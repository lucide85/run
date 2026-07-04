import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { computeZones } from "../data/program.js";
import { zoneSecondsFromStreams } from "./intervals.js";
import { bestSegmentSec } from "./records.js";

/**
 * Formkurven: treningsbelastning per dag (sone-vektet TRIMP), glattet til
 * Form (CTL, 42 d), Slitasje (ATL, 7 d) og Overskudd (TSB = CTL − ATL),
 * pluss en 10 km-prognose (Riegel) basert på beste 5 km-/1 km-segment i et
 * rullende 42-dagers vindu. Alt beregnes fra lagrede økter – ingen lagring.
 */

export interface FitnessDay {
  date: string; // YYYY-MM-DD
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PredictionPoint {
  date: string; // YYYY-MM-DD
  predictedSec: number;
  basedOn: "5k" | "1k";
}

export interface FitnessResult {
  days: FitnessDay[];
  prediction: {
    current: PredictionPoint | null;
    history: PredictionPoint[];
  };
}

const CTL_DAYS = 42;
const ATL_DAYS = 7;
const RIEGEL_EXP = 1.06;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function riegel10k(bestSec: number, fromKm: number): number {
  return Math.round(bestSec * Math.pow(10 / fromKm, RIEGEL_EXP));
}

export async function computeFitness(user: User): Promise<FitnessResult> {
  const zones = computeZones(user.maxHr, user.restHr);
  const workouts = await prisma.workout.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      durationSec: true,
      hrZoneSecondsJson: true,
      streamsJson: true,
      sport: true,
      rawType: true,
    },
  });
  if (workouts.length === 0) return { days: [], prediction: { current: null, history: [] } };

  // Belastning per dag: Σ minutter-i-sone × sonenummer.
  // Soner regnes helst på nytt fra strømmen med brukerens soner.
  const loadByDay = new Map<string, number>();
  const segmentsByDay = new Map<string, { best5k: number | null; best1k: number | null }>();

  for (const w of workouts) {
    let zoneSecs: Record<number | string, number> | null = zoneSecondsFromStreams(w.streamsJson, zones);
    if (!zoneSecs && w.hrZoneSecondsJson) {
      try {
        zoneSecs = JSON.parse(w.hrZoneSecondsJson);
      } catch {
        zoneSecs = null;
      }
    }
    let load = 0;
    if (zoneSecs) {
      for (const [z, sec] of Object.entries(zoneSecs)) {
        const zone = Number(z);
        if (zone >= 1 && zone <= 5 && typeof sec === "number") load += (sec / 60) * zone;
      }
    } else if (w.durationSec) {
      // Uten pulsdata: anta moderat intensitet (sone 2)
      load = (w.durationSec / 60) * 2;
    }
    const key = dayKey(w.startTime);
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + Math.round(load));

    // Beste segmenter for prognosen (kun løpeøkter)
    const s = `${w.sport ?? ""} ${w.rawType ?? ""}`.toLowerCase();
    if (s.includes("run") || s.includes("løp")) {
      let streams: unknown[] = [];
      try {
        streams = w.streamsJson ? JSON.parse(w.streamsJson) : [];
      } catch {
        streams = [];
      }
      const best5k = bestSegmentSec(streams as { t?: number; distanceKm?: number }[], 5);
      const best1k = bestSegmentSec(streams as { t?: number; distanceKm?: number }[], 1);
      const cur = segmentsByDay.get(key) ?? { best5k: null, best1k: null };
      if (best5k && (!cur.best5k || best5k < cur.best5k)) cur.best5k = best5k;
      if (best1k && (!cur.best1k || best1k < cur.best1k)) cur.best1k = best1k;
      segmentsByDay.set(key, cur);
    }
  }

  // Dagserie fra første økt til i dag
  const first = new Date(workouts[0].startTime);
  first.setUTCHours(12, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  const days: FitnessDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = new Date(first); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = dayKey(d);
    const load = loadByDay.get(key) ?? 0;
    ctl = ctl + (load - ctl) / CTL_DAYS;
    atl = atl + (load - atl) / ATL_DAYS;
    days.push({
      date: key,
      load,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  // Prognose: ett punkt per uke (søndager) + i dag. Beste segment i
  // rullende 42-dagers vindu fram til punktet; 5 km foretrekkes.
  const history: PredictionPoint[] = [];
  const segmentDays = [...segmentsByDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const predictAt = (endKey: string): PredictionPoint | null => {
    const end = new Date(`${endKey}T12:00:00Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - CTL_DAYS);
    let best5k: number | null = null;
    let best1k: number | null = null;
    for (const [k, seg] of segmentDays) {
      if (k > endKey || k < dayKey(start)) continue;
      if (seg.best5k && (!best5k || seg.best5k < best5k)) best5k = seg.best5k;
      if (seg.best1k && (!best1k || seg.best1k < best1k)) best1k = seg.best1k;
    }
    if (best5k) return { date: endKey, predictedSec: riegel10k(best5k, 5), basedOn: "5k" };
    if (best1k) return { date: endKey, predictedSec: riegel10k(best1k, 1), basedOn: "1k" };
    return null;
  };

  for (const day of days) {
    const d = new Date(`${day.date}T12:00:00Z`);
    if (d.getUTCDay() === 0 || day.date === days[days.length - 1].date) {
      const p = predictAt(day.date);
      if (p) history.push(p);
    }
  }

  return {
    days,
    prediction: { current: history.length ? history[history.length - 1] : null, history },
  };
}
