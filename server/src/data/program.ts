// Hele 17-ukers programmet, kodet fra treningsprogram-10km.md.
// Pulssoner (Karvonen, makspuls 195 / hvilepuls 50) og måltempo hentes fra programmets tabeller.

export type SessionType = "easy" | "quality" | "long" | "race";

export interface ProgramSession {
  slot: number; // 1, 2, 3 — øktnummer i uken
  type: SessionType;
  title: string;
  description: string;
  distanceKm?: number; // kjent planlagt distanse (rolige økter / langturer)
}

export interface ProgramWeek {
  week: number;
  phase: number;
  phaseName: string;
  lightWeek?: boolean;
  sessions: ProgramSession[];
}

// Pulssoner fra programmet (slag/min) — brukes til visning og AI-kontekst.
export const HR_ZONES = [
  { zone: 1, name: "Restitusjon", min: 122, max: 137, use: "Svært lett jogg, oppvarming/nedjogg" },
  { zone: 2, name: "Rolig aerob", min: 137, max: 152, use: "Rolige økter og langturer" },
  { zone: 3, name: "Tempo", min: 152, max: 166, use: "Tempoøkter, lengre terskeldrag" },
  { zone: 4, name: "Terskel", min: 166, max: 181, use: "Terskelintervaller, harde drag" },
  { zone: 5, name: "Maks", min: 181, max: 195, use: "Korte, harde intervaller (400–800 m)" },
];

// Måltempo (sekunder per km) og sone-tekst per økttype/innhold.
export interface Targets {
  zone: string;
  paceMinSec?: number;
  paceMaxSec?: number;
}

export function deriveTargets(type: SessionType, description: string): Targets {
  const d = description.toLowerCase();
  if (type === "easy" || type === "long") {
    return { zone: "Sone 2 (137–152)", paceMinSec: 435, paceMaxSec: 465 }; // 7:15–7:45
  }
  if (type === "race") {
    return { zone: "Konkurranse (Sone 3–4)", paceMinSec: 375, paceMaxSec: 390 };
  }
  // quality: skill mellom terskel/tempo og konkurransefart/intervall
  if (d.includes("konkurransefart") || d.includes("intervall") || d.includes("400 m") || d.includes("800 m")) {
    return { zone: "Sone 4–5 (175–190)", paceMinSec: 345, paceMaxSec: 375 }; // 5:45–6:15
  }
  return { zone: "Sone 3–4 (160–175)", paceMinSec: 375, paceMaxSec: 390 }; // terskel/tempo 6:15–6:30
}

export const PROGRAM: ProgramWeek[] = [
  // ---- Fase 1 – Grunnlag (uke 1–4) ----
  {
    week: 1, phase: 1, phaseName: "Grunnlag",
    sessions: [
      { slot: 1, type: "easy", title: "4 km rolig", description: "4 km rolig", distanceKm: 4 },
      { slot: 2, type: "easy", title: "5 km rolig + stigninger", description: "5 km rolig + 4 × 20 sek stigninger", distanceKm: 5 },
      { slot: 3, type: "long", title: "Langtur 6 km", description: "6 km rolig", distanceKm: 6 },
    ],
  },
  {
    week: 2, phase: 1, phaseName: "Grunnlag",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "easy", title: "5 km rolig + stigninger", description: "5 km rolig + 5 × 20 sek stigninger", distanceKm: 5 },
      { slot: 3, type: "long", title: "Langtur 7 km", description: "7 km rolig", distanceKm: 7 },
    ],
  },
  {
    week: 3, phase: 1, phaseName: "Grunnlag",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "easy", title: "6 km rolig + stigninger", description: "6 km rolig + 5 × 20 sek stigninger", distanceKm: 6 },
      { slot: 3, type: "long", title: "Langtur 8 km", description: "8 km rolig", distanceKm: 8 },
    ],
  },
  {
    week: 4, phase: 1, phaseName: "Grunnlag", lightWeek: true,
    sessions: [
      { slot: 1, type: "easy", title: "4 km rolig", description: "4 km rolig", distanceKm: 4 },
      { slot: 2, type: "easy", title: "5 km rolig (lett uke)", description: "5 km rolig (lett uke)", distanceKm: 5 },
      { slot: 3, type: "long", title: "Langtur 6 km", description: "6 km rolig", distanceKm: 6 },
    ],
  },

  // ---- Fase 2 – Bygging (uke 5–9) ----
  {
    week: 5, phase: 2, phaseName: "Bygging",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "Terskel 5 × 3 min", description: "10–15 min oppvarming + 5 × 3 min terskel / 2 min gange-pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 8 km", description: "8 km rolig", distanceKm: 8 },
    ],
  },
  {
    week: 6, phase: 2, phaseName: "Bygging",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "Intervall 6 × 400 m", description: "Oppvarming + 6 × 400 m intervall / 90 sek pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 9 km", description: "9 km rolig", distanceKm: 9 },
    ],
  },
  {
    week: 7, phase: 2, phaseName: "Bygging",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "Terskel 2 × 8 min", description: "Oppvarming + 2 × 8 min terskel / 3 min pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 10 km", description: "10 km rolig", distanceKm: 10 },
    ],
  },
  {
    week: 8, phase: 2, phaseName: "Bygging", lightWeek: true,
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "Intervall 8 × 400 m", description: "Oppvarming + 8 × 400 m intervall / 90 sek pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 8 km (lett uke)", description: "8 km rolig (lett uke)", distanceKm: 8 },
    ],
  },
  {
    week: 9, phase: 2, phaseName: "Bygging",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "Terskel 3 × 6 min", description: "Oppvarming + 3 × 6 min terskel / 2 min pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 11 km", description: "11 km rolig", distanceKm: 11 },
    ],
  },

  // ---- Fase 3 – Spissing (uke 10–14) ----
  {
    week: 10, phase: 3, phaseName: "Spissing",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "5 × 800 m konkurransefart", description: "Oppvarming + 5 × 800 m i konkurransefart / 2 min pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 11 km", description: "11 km rolig", distanceKm: 11 },
    ],
  },
  {
    week: 11, phase: 3, phaseName: "Spissing",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "4 × 1000 m konkurransefart", description: "Oppvarming + 4 × 1000 m i konkurransefart / 2 min pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 12 km", description: "12 km rolig", distanceKm: 12 },
    ],
  },
  {
    week: 12, phase: 3, phaseName: "Spissing", lightWeek: true,
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "20 min terskel", description: "Oppvarming + 20 min sammenhengende terskel + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 10 km (lett uke)", description: "10 km rolig (lett uke)", distanceKm: 10 },
    ],
  },
  {
    week: 13, phase: 3, phaseName: "Spissing",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "3 × 2000 m konkurransefart", description: "Oppvarming + 3 × 2000 m i konkurransefart / 3 min pause + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 12 km", description: "12 km rolig", distanceKm: 12 },
    ],
  },
  {
    week: 14, phase: 3, phaseName: "Spissing",
    sessions: [
      { slot: 1, type: "easy", title: "6 km rolig", description: "6 km rolig", distanceKm: 6 },
      { slot: 2, type: "quality", title: "5 km konkurransefart", description: "Oppvarming + 5 km i konkurransefart + nedjogg" },
      { slot: 3, type: "long", title: "Langtur 10 km", description: "10 km rolig", distanceKm: 10 },
    ],
  },

  // ---- Fase 4 – Nedtrapping og løp (uke 15–17) ----
  {
    week: 15, phase: 4, phaseName: "Nedtrapping",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "4 × 1000 m konkurransefart (lett)", description: "Oppvarming + 4 × 1000 m i konkurransefart / 2 min pause" },
      { slot: 3, type: "long", title: "Langtur 8 km", description: "8 km rolig", distanceKm: 8 },
    ],
  },
  {
    week: 16, phase: 4, phaseName: "Nedtrapping",
    sessions: [
      { slot: 1, type: "easy", title: "5 km rolig", description: "5 km rolig", distanceKm: 5 },
      { slot: 2, type: "quality", title: "3 × 800 m konkurransefart (lett)", description: "Oppvarming + 3 × 800 m i konkurransefart / 2 min pause" },
      { slot: 3, type: "long", title: "Langtur 6 km", description: "6 km rolig", distanceKm: 6 },
    ],
  },
  {
    week: 17, phase: 4, phaseName: "Nedtrapping",
    sessions: [
      { slot: 1, type: "easy", title: "4 km rolig", description: "4 km rolig", distanceKm: 4 },
      { slot: 2, type: "easy", title: "3 km rolig + stigninger", description: "3 km rolig + 4 stigninger (2–3 dager før løp)", distanceKm: 3 },
      { slot: 3, type: "race", title: "🏁 LØPSDAG: 10 km", description: "Start kontrollert de første 2 km, finn rytmen, øk de siste 2–3 km om du har overskudd.", distanceKm: 10 },
    ],
  },
];

// Beregn pulssoner med Karvonen-metoden (50/60/70/80/90/100 % av pulsreserve).
export function computeZones(maxHr: number, restHr: number) {
  const hrr = maxHr - restHr;
  const names = ["Restitusjon", "Rolig aerob", "Tempo", "Terskel", "Maks"];
  const pcts = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  return names.map((name, i) => ({
    zone: i + 1,
    name,
    min: Math.round(restHr + pcts[i] * hrr),
    max: Math.round(restHr + pcts[i + 1] * hrr),
  }));
}

export const PHASE_GOALS: Record<number, string> = {
  1: "Etablere rutinen, bygge rolig aerob form, vente med fart.",
  2: "Introdusere fart, øke langturen.",
  3: "Vende kroppen til konkurransefart.",
  4: "Bli uthvilt og frisk – formen er bygget, nå skal du lade opp.",
};
