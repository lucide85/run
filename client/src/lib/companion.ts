import type { PlannedSession, Workout } from "../api/client";

/**
 * Treningskompis – ren beregningslogikk.
 * Alt her er rene funksjoner av data klienten allerede henter
 * (planlagte økter + treningsøkter). Ingen lagring, ingen sideeffekter.
 */

export type CompanionStage = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Foretrukket bildeformat for figurene i client/public/companion/.
 * "webp" = de AI-rendrede 3D-bildene. Finnes ikke webp-fila (ennå),
 * faller <img> automatisk tilbake til den håndtegnede SVG-en via
 * stageImageFallbackUrl + handleStageImageError – så appen viser alltid
 * en figur uansett hvilke filer som ligger der.
 * Se client/public/companion/README.md for hvordan webp-ene lages.
 */
export const COMPANION_IMAGE_EXT = "webp";

/** Primær bilde-URL (foretrukket format). */
export function stageImageUrl(stage: CompanionStage): string {
  return `/companion/stage-${stage}.${COMPANION_IMAGE_EXT}`;
}

/** Reserve-URL: alltid den innebygde SVG-en. */
export function stageImageFallbackUrl(stage: CompanionStage): string {
  return `/companion/stage-${stage}.svg`;
}

/**
 * onError-håndterer for figur-<img>: bytt til SVG-en én gang hvis webp-fila
 * mangler. Bruk med data-stage="<steg>" på img-elementet.
 */
export function handleStageImageError(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  const stage = Number(img.dataset.stage) as CompanionStage;
  const fallback = stageImageFallbackUrl(stage);
  if (!img.src.endsWith(".svg") && Number.isFinite(stage)) {
    img.src = fallback;
  }
}

export interface CompanionStageInfo {
  stage: CompanionStage;
  name: string;
  description: string;
}

export const COMPANION_STAGES: CompanionStageInfo[] = [
  {
    stage: 0,
    name: "Egget",
    description: "Rugger forsiktig på seg. Noe fantastisk er på gang der inne …",
  },
  {
    stage: 1,
    name: "Nøstet",
    description: "Nyklekket og nysgjerrig – titter fram fra skallet og heier på hver eneste tur.",
  },
  {
    stage: 2,
    name: "Joggelua",
    description: "Har fått bein og pannebånd, og tripper utålmodig rundt i stua.",
  },
  {
    stage: 3,
    name: "Løperen",
    description: "Ekte joggesko og ekte flyt. Nå snakker vi kilometer!",
  },
  {
    stage: 4,
    name: "Raketten",
    description: "Strømlinjeformet og lynrask. Vinden har begynt å be om forsprang.",
  },
  {
    stage: 5,
    name: "Legenden",
    description: "Medalje, kappe og evig heder. Historien om dere to skrives allerede.",
  },
];

/** Minste antall fullførte økter for å nå hvert steg (indeks = steg). */
export const STAGE_THRESHOLDS: number[] = [0, 3, 9, 18, 30, 44];

/** Steg for et gitt antall fullførte økter (uten løpsdag-regelen). */
export function stageForCount(completedCount: number): CompanionStage {
  for (let s = 5; s >= 1; s--) {
    if (completedCount >= STAGE_THRESHOLDS[s]) return s as CompanionStage;
  }
  return 0;
}

/**
 * Beregn kompisens utviklingssteg.
 * Fullført konkurranseløp (type "race") gir alltid steg 5.
 */
export function computeStage(sessions: PlannedSession[]): CompanionStage {
  const list = Array.isArray(sessions) ? sessions : [];
  const raceCompleted = list.some((s) => s.type === "race" && s.status === "completed");
  if (raceCompleted) return 5;
  const completed = list.filter((s) => s.status === "completed").length;
  return stageForCount(completed);
}

export type CompanionMood = "jubler" | "fornøyd" | "klar" | "døser";

/**
 * Humør basert på timer siden siste treningsøkt (workouts er sortert
 * nyeste først). Ingen økter → "klar". Aldri fordømmende – kompisen
 * er tålmodig og glad uansett.
 */
export function computeMood(workouts: Workout[], now: Date = new Date()): CompanionMood {
  const latest = Array.isArray(workouts) ? workouts[0] : undefined;
  if (!latest?.startTime) return "klar";
  const t = new Date(latest.startTime).getTime();
  if (!Number.isFinite(t)) return "klar";
  const hours = (now.getTime() - t) / 3_600_000;
  if (hours < 24) return "jubler";
  if (hours <= 72) return "fornøyd";
  if (hours <= 120) return "klar";
  return "døser";
}

/** Vennlige, aldri masete humør-tekster. */
export const MOOD_CAPTIONS: Record<CompanionMood, string> = {
  jubler: "Fersk løpetur i beina – kompisen din jubler! 🎉",
  fornøyd: "Kompisen din er stolt og strålende fornøyd med formen 😊",
  klar: "Kompisen din står klar i startblokka – når som helst! 👟",
  døser: "Kompisen din tar en powernap og gleder seg til neste tur 💤",
};

export interface EvolutionEvent {
  stage: CompanionStage;
  /** ISO-dato for økten som utløste utviklingen. */
  date: string;
}

/**
 * Rekonstruer utviklingshistorikken fra fullførte økter – helt uten
 * lagring. Sorterer fullførte økter etter dato og finner datoen der
 * N-te fullføring krysset hvert terskelnivå. Fullført løpsdag gir
 * steg 5 direkte.
 */
export function evolutionHistory(sessions: PlannedSession[]): EvolutionEvent[] {
  const done = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s.status === "completed" && !!s.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const events: EvolutionEvent[] = [];
  let nextStage = 1;
  for (let i = 0; i < done.length && nextStage <= 5; i++) {
    const count = i + 1;
    while (nextStage <= 5 && count >= STAGE_THRESHOLDS[nextStage]) {
      events.push({ stage: nextStage as CompanionStage, date: done[i].date });
      nextStage++;
    }
  }

  // Fullført konkurranseløp gir steg 5 uansett antall økter.
  if (nextStage <= 5) {
    const race = done.find((s) => s.type === "race");
    if (race) events.push({ stage: 5, date: race.date });
  }

  return events;
}

/** Lokal ISO 8601-ukenøkkel, f.eks. "2026-W27" (bevisst ikke importert utenfra). */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // torsdag i samme uke
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * Antall sammenhengende ISO-uker (som slutter i inneværende eller
 * forrige uke) med minst én fullført økt.
 */
export function streakWeeks(sessions: PlannedSession[], now: Date = new Date()): number {
  const weeks = new Set(
    (Array.isArray(sessions) ? sessions : [])
      .filter((s) => s.status === "completed" && !!s.date)
      .map((s) => new Date(s.date))
      .filter((d) => Number.isFinite(d.getTime()))
      .map((d) => isoWeekKey(d))
  );
  if (weeks.size === 0) return 0;

  const cursor = new Date(now);
  // Streaken kan «leve» selv om inneværende uke ikke har økt ennå.
  if (!weeks.has(isoWeekKey(cursor))) cursor.setDate(cursor.getDate() - 7);

  let count = 0;
  while (weeks.has(isoWeekKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return count;
}

export interface NextStageProgress {
  /** Fullførte økter innenfor gjeldende steg-intervall. */
  doneInStage: number;
  /** Økter som trengs totalt i intervallet for å nå neste steg. */
  neededInStage: number;
  /** Gjenstående økter til neste utvikling. */
  remaining: number;
}

/** Fremdrift mot neste steg. Returnerer null på steg 5 (maks nivå). */
export function nextStageProgress(sessions: PlannedSession[]): NextStageProgress | null {
  const stage = computeStage(sessions);
  if (stage >= 5) return null;
  const completed = (Array.isArray(sessions) ? sessions : []).filter(
    (s) => s.status === "completed"
  ).length;
  const lower = STAGE_THRESHOLDS[stage];
  const upper = STAGE_THRESHOLDS[stage + 1];
  return {
    doneInStage: Math.max(0, Math.min(completed - lower, upper - lower)),
    neededInStage: upper - lower,
    remaining: Math.max(0, upper - completed),
  };
}
