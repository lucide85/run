// Pulssoner beregnet med Karvonen-metoden (prosent av pulsreserve over hvilepuls).
// Grensene 50/60/70/80/90/100 % gjenspeiler sonene i treningsprogrammet
// (makspuls 195 / hvilepuls 50 → S1 122–137, S2 137–152, S3 152–166, S4 166–181, S5 181–195).

export interface Zone {
  zone: number;
  name: string;
  min: number;
  max: number;
}

const ZONE_NAMES = ["Restitusjon", "Rolig aerob", "Tempo", "Terskel", "Maks"];
const ZONE_PCTS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

export function computeZones(maxHr: number, restHr: number): Zone[] {
  const hrr = maxHr - restHr;
  const zones: Zone[] = [];
  for (let i = 0; i < 5; i++) {
    zones.push({
      zone: i + 1,
      name: ZONE_NAMES[i],
      min: Math.round(restHr + ZONE_PCTS[i] * hrr),
      max: Math.round(restHr + ZONE_PCTS[i + 1] * hrr),
    });
  }
  return zones;
}

export function zoneForHr(hr: number, zones: Zone[]): number {
  for (const z of zones) {
    if (hr <= z.max) return z.zone;
  }
  return 5;
}

export const ZONE_COLORS = ["#cbd5e1", "#38bdf8", "#34d399", "#fbbf24", "#f43f5e"];

/** Beregn sekunder i hver sone fra en pulsstrøm (med tidsstempel t i sekunder). */
export function zoneSecondsFromStreams(
  streams: { t: number; hr?: number }[],
  zones: Zone[]
): Record<number, number> {
  const result: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 1; i < streams.length; i++) {
    const hr = streams[i].hr;
    if (hr == null) continue;
    const dt = Math.max(0, streams[i].t - streams[i - 1].t);
    result[zoneForHr(hr, zones)] += dt;
  }
  return result;
}
