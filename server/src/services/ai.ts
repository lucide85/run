import Anthropic from "@anthropic-ai/sdk";
import type { PlannedSession, Workout, User } from "@prisma/client";
import { loadConfig } from "../config.js";
import { computeZones } from "../data/program.js";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const cfg = loadConfig();
    client = new Anthropic({ apiKey: cfg.anthropic.apiKey });
  }
  return client;
}

function model(): string {
  return loadConfig().anthropic.model || "claude-opus-4-8";
}

// Brukerspesifikk, men stabil kontekst (caches mellom kall via prompt caching).
function coachContext(user: User): string {
  const zoneLines = computeZones(user.maxHr, user.restHr)
    .map((z) => `Sone ${z.zone} (${z.name}): ${z.min}-${z.max} bpm`)
    .join("\n");
  const race = user.raceDate
    ? `${user.raceName ?? "et løp"} den ${user.raceDate.toISOString().slice(0, 10)}`
    : "et kommende løp (dato ikke satt)";

  return `Du er en erfaren, vennlig løpetrener for ${user.nickname}, som trener mot ${race}.
Makspuls ${user.maxHr}, hvilepuls ${user.restHr} (Karvonen).

PULSSONER:
${zoneLines}

Viktige prinsipper: rolige økter SKAL være rolige (sone 2) – den vanligste feilen er å løpe lette dager for hardt. Pulsdrift utover langturer og i varme er normalt. Styr etter puls, ikke klokke, når det er varmt eller tungt. Bygg formen gradvis og kom skadefri til start. Svar på norsk, konkret og oppmuntrende.`;
}

/** Komprimer en økt til tekst egnet for modellen (nedsamplet strøm). */
export function summarizeWorkout(w: Workout): string {
  const fmtPace = (s?: number | null) =>
    s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min/km` : "ukjent";
  const lines: string[] = [];
  lines.push(`Dato: ${w.startTime.toISOString().slice(0, 10)}`);
  lines.push(`Distanse: ${w.distanceKm?.toFixed(2) ?? "?"} km`);
  if (w.durationSec)
    lines.push(`Varighet: ${Math.floor(w.durationSec / 60)} min ${w.durationSec % 60} sek`);
  lines.push(`Snittfart: ${fmtPace(w.avgPaceSecPerKm)}`);
  lines.push(`Snittpuls: ${w.avgHr ?? "?"}, maxpuls: ${w.maxHr ?? "?"}`);
  if (w.elevationGainM != null) lines.push(`Stigning: ${w.elevationGainM} m`);
  if (w.avgCadence) lines.push(`Snittkadens: ${w.avgCadence} steg/min`);
  if (w.calories) lines.push(`Kalorier: ${w.calories}`);

  if (w.hrZoneSecondsJson) {
    const z = JSON.parse(w.hrZoneSecondsJson) as Record<string, number>;
    const total = Object.values(z).reduce((a, b) => a + b, 0) || 1;
    const dist = Object.entries(z)
      .map(([zone, sec]) => `S${zone}: ${Math.round((sec / total) * 100)}%`)
      .join(", ");
    lines.push(`Pulssone-fordeling: ${dist}`);
  }

  if (w.lapsJson) {
    const laps = JSON.parse(w.lapsJson) as any[];
    if (laps.length > 1 && laps.length <= 30) {
      lines.push("Runder:");
      for (const l of laps) {
        lines.push(
          `  ${l.index}: ${l.distanceKm?.toFixed(2) ?? "?"} km @ ${fmtPace(l.avgPaceSecPerKm)}, puls ${l.avgHr ?? "?"}`
        );
      }
    }
  }
  return lines.join("\n");
}

function plannedContext(p: PlannedSession | null): string {
  if (!p) return "Denne økten er ikke koblet til en planlagt økt.";
  return `Planlagt økt (uke ${p.week}, fase ${p.phase} – ${p.phaseName}): ${p.title}\n${p.description}\nMålsone: ${p.targetZone ?? "?"}`;
}

const systemBlocks = (user: User) => [
  {
    type: "text" as const,
    text: coachContext(user),
    cache_control: { type: "ephemeral" as const },
  },
];

/** Førstegangs-vurdering av en økt. */
export async function evaluateWorkout(
  user: User,
  workout: Workout,
  planned: PlannedSession | null,
  history: string
): Promise<string> {
  const userText = `Her er en gjennomført treningsøkt jeg lastet opp fra Garmin.

${plannedContext(planned)}

GJENNOMFØRT ØKT:
${summarizeWorkout(workout)}

${history ? `SISTE ØKTER (kontekst):\n${history}\n` : ""}
Gi meg en kort, konkret vurdering: Traff jeg hensikten med økten (riktig sone/tempo)? Hva var bra? Er det noe å justere til neste gang? Maks 150 ord.`;

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 700,
    system: systemBlocks(user),
    messages: [{ role: "user", content: userText }],
  });
  return textOf(resp);
}

/** Oppfølgingschat på en økt. Tar med full historikk. */
export async function chatAboutWorkout(
  user: User,
  workout: Workout,
  planned: PlannedSession | null,
  thread: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const intro = `Kontekst for samtalen — en gjennomført økt:

${plannedContext(planned)}

${summarizeWorkout(workout)}`;

  const messages = [
    { role: "user" as const, content: intro },
    {
      role: "assistant" as const,
      content: "Forstått, jeg har øktdataene. Spør i vei.",
    },
    ...thread,
  ];

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 900,
    system: systemBlocks(user),
    messages,
  });
  return textOf(resp);
}

/** Korte, presise pulsklokke-tips for en planlagt økt. */
export async function generateWatchTips(user: User, session: PlannedSession): Promise<string> {
  const fmtPace = (s?: number | null) =>
    s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min/km` : null;

  const zones = computeZones(user.maxHr, user.restHr);
  // Tolk kun sonetall fra teksten FØR en evt. parentes («Sone 2 (137–152)» → [2])
  const zoneNums = ((session.targetZone ?? "").split("(")[0].match(/\d/g) ?? [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 5);
  const zoneInfo =
    zoneNums.length > 0
      ? zones
          .filter((z) => z.zone >= Math.min(...zoneNums) && z.zone <= Math.max(...zoneNums))
          .map((z) => `Sone ${z.zone} (${z.name}) = ${z.min}–${z.max} bpm`)
          .join(", ")
      : "";
  const paceRange =
    fmtPace(session.targetPaceMinSec) && fmtPace(session.targetPaceMaxSec)
      ? `${fmtPace(session.targetPaceMinSec)}–${fmtPace(session.targetPaceMaxSec)}`
      : null;

  const watch = user.watchModel?.trim()
    ? `Brukeren har en ${user.watchModel.trim()} – gi tips spesifikt for den (menyer/funksjoner den faktisk har).`
    : "Brukeren har ikke oppgitt klokkemodell – gi generelle tips som passer vanlige GPS-pulsklokker.";

  const userText = `Lag korte oppsettstips for pulsklokken til denne planlagte økten.

ØKT (uke ${session.week}, ${session.phaseName}, type "${session.type}"): ${session.title}
${session.description}
${session.targetZone ? `Målsone: ${session.targetZone} (${zoneInfo})` : ""}
${paceRange ? `Måltempo: ${paceRange} /km` : ""}
${session.plannedDistanceKm ? `Planlagt distanse: ${session.plannedDistanceKm} km` : ""}

${watch}

KRAV TIL SVARET (markdown, norsk):
- Start med én linje "🎯 Mål:" med pulssone i bpm${paceRange ? " og tempo" : ""} – bruk de EKSAKTE tallene over.
- Deretter klokkeoppsett: for ENKLE økter (rolig/langtur) maks 2–3 korte punkter (f.eks. pulsvarsel/sonealarm og datafelt). For INTERVALL-/kvalitetsøkter: konkret oppsett av intervall-/treningsøkt-funksjonen (drag, pauser, mål per del) + 2–3 tips for godt utbytte (oppvarming, disponering, vanlige feil).
- Maks ~120 ord totalt. Ingen innledning eller avslutning.`;

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 600,
    system: systemBlocks(user),
    messages: [{ role: "user", content: userText }],
  });
  return textOf(resp);
}

export interface PlanAdjustmentProposal {
  summary: string;
  changes: {
    sessionId: number;
    field: "description" | "title" | "date";
    before: string;
    after: string;
    reason: string;
  }[];
}

/** Foreslå justeringer av kommende økter basert på progresjon. */
export async function proposePlanAdjustment(
  user: User,
  upcoming: PlannedSession[],
  recentHistory: string
): Promise<PlanAdjustmentProposal> {
  const upcomingText = upcoming
    .map((s) => `#${s.id} (uke ${s.week}, ${s.date.toISOString().slice(0, 10)}): ${s.title} — ${s.description}`)
    .join("\n");

  const tool: Anthropic.Tool = {
    name: "propose_plan_changes",
    description: "Foreslå konkrete justeringer av kommende økter.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Kort begrunnelse på norsk (1-3 setninger)." },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sessionId: { type: "number" },
              field: { type: "string", enum: ["description", "title", "date"] },
              before: { type: "string" },
              after: { type: "string" },
              reason: { type: "string" },
            },
            required: ["sessionId", "field", "before", "after", "reason"],
          },
        },
      },
      required: ["summary", "changes"],
    },
  };

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 1500,
    system: systemBlocks(user),
    tools: [tool],
    tool_choice: { type: "tool", name: "propose_plan_changes" },
    messages: [
      {
        role: "user",
        content: `Vurder progresjonen min og foreslå eventuelle tilpasninger av de kommende øktene. Vær konservativ — endre bare det som gir tydelig mening (f.eks. justere tempo/distanse hvis jeg ligger foran/bak, eller flytte en økt hvis jeg har hoppet over flere). Hvis alt ser bra ut, returner en tom changes-liste.

KOMMENDE ØKTER:
${upcomingText}

SISTE GJENNOMFØRTE ØKTER:
${recentHistory || "(ingen ennå)"}`,
      },
    ],
  });

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "propose_plan_changes") {
      return block.input as PlanAdjustmentProposal;
    }
  }
  return { summary: "Ingen endringer foreslått.", changes: [] };
}

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
