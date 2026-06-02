import FitParserImport from "fit-file-parser";
import { HR_ZONES } from "../data/program.js";

// fit-file-parser er en CommonJS-pakke som legger konstruktøren på .default.
// Under ESM/tsx blir default-importen hele exports-objektet, så vi henter .default hvis den finnes.
const FitParser: any = (FitParserImport as any)?.default ?? FitParserImport;

export interface StreamPoint {
  t: number; // sekunder fra start
  hr?: number;
  paceSecPerKm?: number;
  altitude?: number; // meter
  distanceKm?: number; // kumulativ distanse
  cadence?: number;
}

export interface ParsedLap {
  index: number;
  distanceKm?: number;
  durationSec?: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
}

export interface ParsedWorkout {
  startTime: Date;
  sport?: string;
  distanceKm?: number;
  durationSec?: number;
  avgHr?: number;
  maxHr?: number;
  avgPaceSecPerKm?: number;
  elevationGainM?: number;
  avgCadence?: number;
  calories?: number;
  streams: StreamPoint[];
  laps: ParsedLap[];
  hrZoneSeconds: Record<number, number>;
}

function zoneForHr(hr: number): number {
  for (const z of HR_ZONES) {
    if (hr <= z.max) return z.zone;
  }
  return 5;
}

function speedKmhToPace(speedKmh?: number): number | undefined {
  if (!speedKmh || speedKmh <= 0) return undefined;
  return Math.round(3600 / speedKmh);
}

/** Parser en FIT-buffer til en strukturert økt. */
export function parseFit(buffer: Buffer): Promise<ParsedWorkout> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: "km/h",
      lengthUnit: "km",
      mode: "both",
    });

    parser.parse(buffer, (error: string | null, data: any) => {
      if (error) return reject(new Error(error));
      try {
        resolve(buildWorkout(data));
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

function buildWorkout(data: any): ParsedWorkout {
  const session = (data.sessions && data.sessions[0]) || {};
  const records: any[] = data.records || [];

  const start: Date = session.start_time || (records[0] && records[0].timestamp) || new Date();
  const startMs = new Date(start).getTime();

  const streams: StreamPoint[] = [];
  const hrZoneSeconds: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let prevMs = startMs;

  for (const r of records) {
    if (!r.timestamp) continue;
    const tMs = new Date(r.timestamp).getTime();
    const t = Math.round((tMs - startMs) / 1000);
    const pace = speedKmhToPace(r.speed ?? r.enhanced_speed);
    const cadence =
      r.cadence != null ? Math.round(r.cadence * 2 + (r.fractional_cadence ?? 0) * 2) : undefined;
    // fit-file-parser skalerer altitude med lengthUnit (km) → gjør om til meter.
    const altKm = r.altitude ?? r.enhanced_altitude;
    const altitude = altKm != null ? Math.round(altKm * 1000 * 10) / 10 : undefined;

    streams.push({
      t,
      hr: r.heart_rate,
      paceSecPerKm: pace && pace < 1200 ? pace : undefined,
      altitude,
      distanceKm: r.distance != null ? Math.round(r.distance * 1000) / 1000 : undefined,
      cadence,
    });

    if (r.heart_rate) {
      const dt = Math.max(0, Math.min(10, (tMs - prevMs) / 1000)); // klamp uteliggere
      hrZoneSeconds[zoneForHr(r.heart_rate)] += dt;
    }
    prevMs = tMs;
  }

  // Høydestigning: session.total_ascent er skalert med lengthUnit (km) → meter.
  // Faller tilbake til å summere stigning fra (allerede meter-konverterte) altitude-punkter.
  let elevationGainM =
    session.total_ascent != null ? Math.round(session.total_ascent * 1000) : undefined;
  if (elevationGainM == null) {
    let gain = 0;
    for (let i = 1; i < streams.length; i++) {
      const a = streams[i - 1].altitude;
      const b = streams[i].altitude;
      if (a != null && b != null && b > a) gain += b - a;
    }
    elevationGainM = Math.round(gain);
  }

  const laps: ParsedLap[] = (data.laps || []).map((lap: any, i: number) => ({
    index: i + 1,
    distanceKm: lap.total_distance,
    durationSec: lap.total_timer_time ? Math.round(lap.total_timer_time) : undefined,
    avgHr: lap.avg_heart_rate,
    avgPaceSecPerKm: speedKmhToPace(lap.avg_speed ?? lap.enhanced_avg_speed),
  }));

  const distanceKm = session.total_distance;
  const durationSec = session.total_timer_time ? Math.round(session.total_timer_time) : undefined;
  const avgPaceSecPerKm =
    distanceKm && durationSec ? Math.round(durationSec / distanceKm) : speedKmhToPace(session.avg_speed);

  const avgCadence =
    session.avg_running_cadence != null
      ? Math.round(session.avg_running_cadence * 2)
      : session.avg_cadence != null
        ? Math.round(session.avg_cadence * 2)
        : undefined;

  return {
    startTime: new Date(start),
    sport: session.sport,
    distanceKm,
    durationSec,
    avgHr: session.avg_heart_rate,
    maxHr: session.max_heart_rate,
    avgPaceSecPerKm,
    elevationGainM,
    avgCadence,
    calories: session.total_calories,
    streams,
    laps,
    hrZoneSeconds,
  };
}
