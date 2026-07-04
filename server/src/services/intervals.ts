import type { ParsedLap, ZoneDef } from "./fit.js";

/**
 * Intervallanalyse: klassifiser runder som drag (work) / pause (recovery) /
 * oppvarming / nedjogg. Brukes for at AI-vurderingen og UI-et skal dømme
 * intervalløkter på DRAGENE – ikke på snittpulsen for hele økten (som
 * naturlig trekkes ned av pausene).
 *
 * Klassifisering skjer i to trinn:
 *  1) Ekte intensitetsflagg fra FIT-fila (strukturert økt på klokka) når de finnes.
 *  2) Ellers en konservativ tempo-heuristikk som fungerer på allerede importerte
 *     økter (lapsJson) uten re-import. Rolige økter med autolap skal IKKE
 *     feilklassifiseres – da returneres "unknown" på alt.
 */

export type LapRole = "warmup" | "work" | "recovery" | "cooldown" | "unknown";

export type ClassifiedLap = ParsedLap & { role: LapRole };

function intensityToRole(intensity?: string): LapRole {
  switch ((intensity ?? "").toLowerCase()) {
    case "active":
    case "interval":
      return "work";
    case "rest":
    case "recovery":
      return "recovery";
    case "warmup":
      return "warmup";
    case "cooldown":
      return "cooldown";
    default:
      return "unknown";
  }
}

export function classifyLaps(laps: ParsedLap[] | null | undefined): ClassifiedLap[] {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  // Trinn 1: intensitetsflagg fra strukturert økt. Krever variasjon –
  // manuelle rundeknapp-økter kan ha "active" på alt, og da sier flaggene ingenting.
  const roles = laps.map((l) => intensityToRole(l.intensity));
  const distinct = new Set(roles.filter((r) => r !== "unknown"));
  if (distinct.size > 1) {
    return laps.map((l, i) => ({ ...l, role: roles[i] }));
  }

  return heuristicClassify(laps);
}

/** Konservativ tempo-heuristikk: raske runder = drag, tydelig tregere = pause. */
function heuristicClassify(laps: ParsedLap[]): ClassifiedLap[] {
  const unknown = (): ClassifiedLap[] => laps.map((l) => ({ ...l, role: "unknown" as LapRole }));

  const paced = laps.filter((l) => l.avgPaceSecPerKm && l.avgPaceSecPerKm > 0);
  if (laps.length < 3 || paced.length < 2) return unknown();

  const paces = paced.map((l) => l.avgPaceSecPerKm!).sort((a, b) => a - b);
  const median = paces[Math.floor(paces.length / 2)];
  if (!median) return unknown();

  const roles: LapRole[] = laps.map((l) => {
    const p = l.avgPaceSecPerKm;
    // Runde uten tempo (stillestående pause) regnes som pause når økten ellers har tempo-data.
    if (!p || p <= 0) return "recovery";
    if (p <= median * 0.93) return "work"; // ≥7 % raskere enn median
    if (p >= median * 1.05) return "recovery"; // ≥5 % tregere enn median
    return "unknown";
  });

  const workCount = roles.filter((r) => r === "work").length;
  const recoveryCount = roles.filter((r) => r === "recovery").length;

  // Krev et tydelig intervallmønster: minst 2 drag, minst 1 pause og minst
  // 2 skifter mellom drag og pause. Ellers er dette trolig en vanlig økt.
  let transitions = 0;
  let prev: LapRole | null = null;
  for (const r of roles) {
    if (r === "unknown") continue;
    if (prev && r !== prev) transitions++;
    prev = r;
  }
  if (workCount < 2 || recoveryCount < 1 || transitions < 2) return unknown();

  // Første/siste runde som ikke er drag er i praksis oppvarming/nedjogg.
  if (roles[0] !== "work") roles[0] = "warmup";
  if (roles[roles.length - 1] !== "work") roles[roles.length - 1] = "cooldown";

  return laps.map((l, i) => ({ ...l, role: roles[i] }));
}

export interface WorkSummary {
  count: number;
  totalWorkSec: number;
  avgWorkDurationSec: number | null;
  avgWorkDistanceKm: number | null;
  avgWorkHr: number | null;
  avgWorkPaceSecPerKm: number | null;
  avgRecoverySec: number | null;
}

/** Oppsummer dragene (varighets-vektet puls, distansevektet tempo). */
export function workSummary(classified: ClassifiedLap[]): WorkSummary | null {
  const work = classified.filter((l) => l.role === "work");
  if (work.length < 2) return null;

  const totalSec = work.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  const totalKm = work.reduce((s, l) => s + (l.distanceKm ?? 0), 0);

  let hrWeighted = 0;
  let hrWeight = 0;
  for (const l of work) {
    if (l.avgHr && l.durationSec) {
      hrWeighted += l.avgHr * l.durationSec;
      hrWeight += l.durationSec;
    }
  }

  const recoveries = classified.filter((l) => l.role === "recovery" && l.durationSec);
  const avgRecoverySec = recoveries.length
    ? Math.round(recoveries.reduce((s, l) => s + (l.durationSec ?? 0), 0) / recoveries.length)
    : null;

  return {
    count: work.length,
    totalWorkSec: totalSec,
    avgWorkDurationSec: totalSec ? Math.round(totalSec / work.length) : null,
    avgWorkDistanceKm: totalKm ? Math.round((totalKm / work.length) * 100) / 100 : null,
    avgWorkHr: hrWeight ? Math.round(hrWeighted / hrWeight) : null,
    avgWorkPaceSecPerKm: totalKm > 0 && totalSec > 0 ? Math.round(totalSec / totalKm) : null,
    avgRecoverySec,
  };
}

/** Trygg parsing av lagret lapsJson (skjemaløs JSON – tåler gamle rader). */
export function parseLapsJson(lapsJson: string | null | undefined): ParsedLap[] {
  if (!lapsJson) return [];
  try {
    const parsed = JSON.parse(lapsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Sonetall fra en målsone-tekst («Sone 4–5 (175–190)» → [4, 5]). */
export function targetZoneNumbers(targetZone: string | null | undefined): number[] {
  if (!targetZone) return [];
  return ((targetZone.split("(")[0].match(/\d/g) ?? []) as string[])
    .map(Number)
    .filter((n) => n >= 1 && n <= 5);
}

/** Sekunder i eller over laveste målsone, fra lagret sone-fordeling. */
export function secondsInTargetZones(
  hrZoneSecondsJson: string | null | undefined,
  targetZones: number[]
): number | null {
  if (!hrZoneSecondsJson || targetZones.length === 0) return null;
  try {
    const z = JSON.parse(hrZoneSecondsJson) as Record<string, number>;
    const minZone = Math.min(...targetZones);
    let sec = 0;
    for (const [zone, s] of Object.entries(z)) {
      if (Number(zone) >= minZone && typeof s === "number") sec += s;
    }
    return Math.round(sec);
  } catch {
    return null;
  }
}

/**
 * Tid-i-sone beregnet på nytt fra lagrede strømmer med BRUKERENS soner.
 * Eldre økter har sone-fordeling lagret med standard-soner (makspuls 195) –
 * dette gir riktig fordeling uten re-import.
 */
export function zoneSecondsFromStreams(
  streamsJson: string | null | undefined,
  zones: ZoneDef[]
): Record<number, number> | null {
  if (!streamsJson) return null;
  try {
    const streams = JSON.parse(streamsJson) as { t?: number; hr?: number }[];
    if (!Array.isArray(streams) || streams.length < 2) return null;
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let any = false;
    for (let i = 0; i < streams.length; i++) {
      const p = streams[i];
      if (p?.hr == null || p.t == null) continue;
      const next = streams[i + 1];
      // Strømmen er nedsamplet – vekt hvert punkt med tiden til neste punkt (klampet).
      const dt = next?.t != null ? Math.max(0, Math.min(60, next.t - p.t)) : 1;
      let zone = 5;
      for (const z of zones) {
        if (p.hr <= z.max) {
          zone = z.zone;
          break;
        }
      }
      out[zone] = (out[zone] ?? 0) + dt;
      any = true;
    }
    return any ? out : null;
  } catch {
    return null;
  }
}
