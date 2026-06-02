import Anthropic from "@anthropic-ai/sdk";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { loadConfig } from "../config.js";
import { computeZones } from "../data/program.js";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: loadConfig().anthropic.apiKey });
  return client;
}
function model(): string {
  return loadConfig().anthropic.model || "claude-opus-4-8";
}

export interface OnboardingAnswers {
  typicalDistanceKm?: number;
  typicalPace?: string; // f.eks. "6:30"
  raceName?: string;
  raceDate: string; // ISO yyyy-mm-dd
  raceDistanceKm: number;
  daysPerWeek: number;
  maxHr?: number;
  restHr?: number;
  other?: string; // fritekst + ev. svar på oppfølgingsspørsmål
}

const WEEKDAY_OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Fornuftige standard-treningsdager ut fra antall økter per uke
const DAYS_BY_COUNT: Record<number, string[]> = {
  1: ["Wed"],
  2: ["Tue", "Sat"],
  3: ["Tue", "Thu", "Sun"],
  4: ["Mon", "Tue", "Thu", "Sat"],
  5: ["Mon", "Tue", "Wed", "Thu", "Sat"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"],
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function utcNoon(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}
function mondayOfWeek(d: Date): Date {
  const dt = utcNoon(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt;
}
function addDays(base: Date, days: number): Date {
  const dt = new Date(base);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

interface PlanSession {
  slot: number;
  type: "easy" | "quality" | "long" | "race";
  title: string;
  description: string;
  distanceKm?: number;
  targetZone?: string;
  paceMinSec?: number;
  paceMaxSec?: number;
}
interface PlanWeek {
  week: number;
  phase: number;
  phaseName: string;
  sessions: PlanSession[];
}

export interface GenerateResult {
  needMoreInfo?: boolean;
  questions?: string[];
  created?: number;
  summary?: string;
}

const PLAN_TOOL: Anthropic.Tool = {
  name: "create_training_plan",
  description: "Lag en fullstendig, periodisert treningsplan fram til løpsdato.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Kort oppsummering av planen på norsk." },
      weeks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            week: { type: "number" },
            phase: { type: "number" },
            phaseName: { type: "string" },
            sessions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "number" },
                  type: { type: "string", enum: ["easy", "quality", "long", "race"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  distanceKm: { type: "number" },
                  targetZone: { type: "string" },
                  paceMinSec: { type: "number", description: "Måltempo raskeste ende, sek/km" },
                  paceMaxSec: { type: "number", description: "Måltempo tregeste ende, sek/km" },
                },
                required: ["slot", "type", "title", "description"],
              },
            },
          },
          required: ["week", "phase", "phaseName", "sessions"],
        },
      },
    },
    required: ["summary", "weeks"],
  },
};

const ASK_TOOL: Anthropic.Tool = {
  name: "ask_clarifying_questions",
  description: "Still 1-3 korte oppfølgingsspørsmål hvis nødvendig før planen lages.",
  input_schema: {
    type: "object",
    properties: { questions: { type: "array", items: { type: "string" } } },
    required: ["questions"],
  },
};

/** Generer en AI-treningsplan for en bruker. Kan be om mer info (ett ekstra steg). */
export async function generatePlan(
  user: User,
  answers: OnboardingAnswers,
  force = false
): Promise<GenerateResult> {
  const maxHr = answers.maxHr ?? user.maxHr;
  const restHr = answers.restHr ?? user.restHr;
  const today = utcNoon(new Date());
  const race = utcNoon(new Date(answers.raceDate));
  const weeksUntil = Math.max(1, Math.ceil((race.getTime() - today.getTime()) / (7 * 86400000)));
  const zoneLines = computeZones(maxHr, restHr)
    .map((z) => `Sone ${z.zone} (${z.name}): ${z.min}-${z.max} bpm`)
    .join("\n");

  const prompt = `Lag en individuell, trygg og periodisert løpeplan.

Utøver: ${user.nickname}
Typisk økt nå: ${answers.typicalDistanceKm ?? "?"} km i ${answers.typicalPace ?? "?"} min/km
Mål: ${answers.raceName ?? "løp"} på ${answers.raceDistanceKm} km, dato ${answers.raceDate}
Antall økter per uke: ${answers.daysPerWeek}
Makspuls ${maxHr}, hvilepuls ${restHr}.
Antall uker til løpet: ${weeksUntil}
Annet: ${answers.other ?? "(ingenting)"}

PULSSONER:
${zoneLines}

Lag nøyaktig ${weeksUntil} uker (week 1..${weeksUntil}), med ${answers.daysPerWeek} økter per uke (slot 1..${answers.daysPerWeek}).
Bruk en fornuftig periodisering (grunnlag → bygging → spissing → nedtrapping) og legg løpet (type "race") som siste økt i siste uke.
Hold de fleste øktene rolige (sone 2), introduser fart gradvis, og inkluder målsone/tempo per økt. Vær konservativ og skadeforebyggende.
${force ? "Du har nok informasjon — lag planen nå." : "Hvis noe avgjørende mangler, kan du stille korte oppfølgingsspørsmål i stedet."}`;

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 8000,
    tools: force ? [PLAN_TOOL] : [PLAN_TOOL, ASK_TOOL],
    tool_choice: force ? { type: "tool", name: "create_training_plan" } : { type: "any" },
    messages: [{ role: "user", content: prompt }],
  });

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "ask_clarifying_questions") {
      const input = block.input as { questions: string[] };
      return { needMoreInfo: true, questions: input.questions };
    }
    if (block.type === "tool_use" && block.name === "create_training_plan") {
      const input = block.input as { summary: string; weeks: PlanWeek[] };
      const created = await persistPlan(user, input.weeks, answers, maxHr, restHr);
      return { created, summary: input.summary };
    }
  }
  // Fallback: tving fram en plan
  if (!force) return generatePlan(user, answers, true);
  return { created: 0, summary: "Klarte ikke å lage en plan." };
}

async function persistPlan(
  user: User,
  weeks: PlanWeek[],
  answers: OnboardingAnswers,
  maxHr: number,
  restHr: number
): Promise<number> {
  const days = DAYS_BY_COUNT[answers.daysPerWeek] ?? DAYS_BY_COUNT[3];
  const dayOffsets = days.map((d) => WEEKDAY_OFFSET[d]).sort((a, b) => a - b);
  const startMonday = mondayOfWeek(new Date());
  const raceDate = utcNoon(new Date(answers.raceDate));

  // Fjern eksisterende plan for brukeren
  await prisma.plannedSession.deleteMany({ where: { userId: user.id } });

  let created = 0;
  for (const w of weeks) {
    for (const s of w.sessions) {
      const offset = dayOffsets[(s.slot - 1) % dayOffsets.length] ?? (s.slot - 1) * 2;
      let date = addDays(startMonday, (w.week - 1) * 7 + offset);
      if (s.type === "race") date = raceDate;
      await prisma.plannedSession.create({
        data: {
          userId: user.id,
          week: w.week,
          phase: w.phase,
          phaseName: w.phaseName,
          type: s.type,
          slot: s.slot,
          title: s.title,
          description: s.description,
          targetZone: s.targetZone ?? null,
          targetPaceMinSec: s.paceMinSec ?? null,
          targetPaceMaxSec: s.paceMaxSec ?? null,
          plannedDistanceKm: s.distanceKm ?? null,
          date,
          status: "planned",
        },
      });
      created++;
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      maxHr,
      restHr,
      raceName: answers.raceName ?? "Løp",
      raceDate,
      trainingDaysJson: JSON.stringify(days),
      onboardingAnswersJson: JSON.stringify(answers),
      mustOnboard: false,
    },
  });

  return created;
}
