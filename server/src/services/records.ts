import type { Workout } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Rekordveggen: personlige rekorder utledet av allerede lagrede økter.
 * Alt beregnes på lesetidspunktet fra streams/felter – ingen ny lagring,
 * ingen skjemaendring. Kun løpeøkter teller.
 */

interface StreamPoint {
  t?: number;
  distanceKm?: number;
}

export interface RecordEntry {
  key: string;
  label: string;
  /** Verdien: sekunder for segment/varighet, km for distanse, m for stigning, sek/km for tempo. */
  value: number;
  unit: "sec" | "km" | "m" | "secPerKm";
  workoutId: number | null;
  /** ISO-dato for økten/uken som satte rekorden. */
  date: string;
  /** Tilleggsinfo, f.eks. ukenummer for «største uke». */
  extra?: string;
}

function isRun(w: Pick<Workout, "sport" | "rawType">): boolean {
  const s = `${w.sport ?? ""} ${w.rawType ?? ""}`.toLowerCase();
  return s.includes("run") || s.includes("løp");
}

function parseStreams(json: string | null): StreamPoint[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Raskeste sammenhengende segment på minst `distKm` i én økt, fra den
 * (nedsamplede) strømmen. To-peker med lineær interpolasjon i endepunktet,
 * så nedsamplingen gir små avvik i stedet for systematisk skjevhet.
 * Returnerer sekunder, eller null hvis økten er for kort / mangler data.
 */
export function bestSegmentSec(streams: StreamPoint[], distKm: number): number | null {
  const pts = streams.filter(
    (p) => typeof p.t === "number" && typeof p.distanceKm === "number"
  ) as { t: number; distanceKm: number }[];
  if (pts.length < 2) return null;
  const total = pts[pts.length - 1].distanceKm - pts[0].distanceKm;
  if (total < distKm) return null;

  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    if (j < i + 1) j = i + 1;
    while (j < pts.length && pts[j].distanceKm - pts[i].distanceKm < distKm) j++;
    if (j >= pts.length) break;
    // Interpoler tidspunktet der segmentet passerer nøyaktig distKm
    const prev = pts[j - 1];
    const cur = pts[j];
    const need = pts[i].distanceKm + distKm;
    const span = cur.distanceKm - prev.distanceKm;
    const frac = span > 0 ? (need - prev.distanceKm) / span : 1;
    const tEnd = prev.t + (cur.t - prev.t) * Math.min(Math.max(frac, 0), 1);
    const sec = tEnd - pts[i].t;
    if (sec > 0 && (best === null || sec < best)) best = sec;
  }
  return best !== null ? Math.round(best) : null;
}

function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-U${week}`;
}

const SEGMENTS: { key: string; label: string; distKm: number }[] = [
  { key: "fastest1k", label: "Raskeste 1 km", distKm: 1 },
  { key: "fastest5k", label: "Raskeste 5 km", distKm: 5 },
  { key: "fastest10k", label: "Raskeste 10 km", distKm: 10 },
];

export async function computeRecords(userId: number): Promise<RecordEntry[]> {
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      startTime: true,
      sport: true,
      rawType: true,
      distanceKm: true,
      durationSec: true,
      avgPaceSecPerKm: true,
      elevationGainM: true,
      streamsJson: true,
    },
  });
  const runs = workouts.filter(isRun);
  if (runs.length === 0) return [];

  const records: RecordEntry[] = [];
  // «Bedre» avhenger av rekordtypen, ikke enheten: segmenttider og tempo skal
  // være LAVEST mulig, mens lengste økt (tid) skal være HØYEST.
  const LOWER_IS_BETTER = new Set(["fastest1k", "fastest5k", "fastest10k", "fastestRun"]);

  const consider = (
    key: string,
    label: string,
    unit: RecordEntry["unit"],
    value: number | null | undefined,
    workoutId: number | null,
    date: Date,
    extra?: string
  ) => {
    if (value == null || !Number.isFinite(value) || value <= 0) return;
    const existing = records.find((r) => r.key === key);
    const better = LOWER_IS_BETTER.has(key)
      ? existing && value < existing.value
      : existing && value > existing.value;
    if (!existing) {
      records.push({ key, label, unit, value, workoutId, date: date.toISOString(), extra });
    } else if (better) {
      Object.assign(existing, { value, workoutId, date: date.toISOString(), extra });
    }
  };

  const weekKm = new Map<string, { km: number; last: Date }>();

  for (const w of runs) {
    const streams = parseStreams(w.streamsJson);
    for (const seg of SEGMENTS) {
      consider(seg.key, seg.label, "sec", bestSegmentSec(streams, seg.distKm), w.id, w.startTime);
    }
    consider("longestRun", "Lengste tur", "km", w.distanceKm, w.id, w.startTime);
    consider("longestDuration", "Lengste økt (tid)", "sec", w.durationSec, w.id, w.startTime);
    consider("mostElevation", "Mest stigning", "m", w.elevationGainM, w.id, w.startTime);
    if ((w.distanceKm ?? 0) >= 3) {
      consider("fastestRun", "Raskeste tur (snitt, ≥3 km)", "secPerKm", w.avgPaceSecPerKm, w.id, w.startTime);
    }

    const wk = isoWeekLabel(w.startTime);
    const cur = weekKm.get(wk) ?? { km: 0, last: w.startTime };
    cur.km += w.distanceKm ?? 0;
    if (w.startTime > cur.last) cur.last = w.startTime;
    weekKm.set(wk, cur);
  }

  for (const [wk, { km, last }] of weekKm) {
    consider("biggestWeek", "Største uke", "km", Math.round(km * 100) / 100, null, last, `Uke ${wk.split("-U")[1]}`);
  }

  const ORDER = ["fastest1k", "fastest5k", "fastest10k", "fastestRun", "longestRun", "longestDuration", "biggestWeek", "mostElevation"];
  records.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return records;
}
