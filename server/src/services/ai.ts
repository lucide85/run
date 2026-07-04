import Anthropic from "@anthropic-ai/sdk";
import type { PlannedSession, Workout, User } from "@prisma/client";
import { loadConfig } from "../config.js";
import { computeZones } from "../data/program.js";
import type { ZoneDef } from "./fit.js";
import {
  classifyLaps,
  parseLapsJson,
  workSummary,
  zoneSecondsFromStreams,
} from "./intervals.js";

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

const ROLE_TAG: Record<string, string> = {
  work: " [drag]",
  recovery: " [pause]",
  warmup: " [oppvarming]",
  cooldown: " [nedjogg]",
  unknown: "",
};

function fmtDur(sec?: number | null): string {
  if (!sec && sec !== 0) return "?";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s} sek`;
}

/**
 * Komprimer en økt til tekst egnet for modellen (nedsamplet strøm).
 * Gis brukerens soner beregnes tid-i-sone på nytt fra strømmen (riktig for
 * alle brukere, også på eldre importer). Runder merkes drag/pause der det
 * kan avgjøres – slik at intervalløkter vurderes på dragene, ikke snittpuls.
 */
export function summarizeWorkout(w: Workout, zones?: ZoneDef[]): string {
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

  // Tid i soner: helst beregnet fra strømmen med brukerens soner, ellers lagret fordeling.
  let zoneSeconds: Record<string, number> | null = null;
  if (zones) zoneSeconds = zoneSecondsFromStreams(w.streamsJson, zones);
  if (!zoneSeconds && w.hrZoneSecondsJson) {
    try {
      zoneSeconds = JSON.parse(w.hrZoneSecondsJson) as Record<string, number>;
    } catch {
      zoneSeconds = null;
    }
  }
  if (zoneSeconds) {
    const total = Object.values(zoneSeconds).reduce((a, b) => a + b, 0) || 1;
    const dist = Object.entries(zoneSeconds)
      .map(
        ([zone, sec]) =>
          `S${zone}: ${Math.round(sec / 60)} min (${Math.round((sec / total) * 100)}%)`
      )
      .join(", ");
    lines.push(`Pulssone-fordeling: ${dist}`);
  }

  const classified = classifyLaps(parseLapsJson(w.lapsJson));
  const ws = workSummary(classified);
  if (ws) {
    lines.push(
      `Drag (arbeidsintervaller): ${ws.count} × ${fmtDur(ws.avgWorkDurationSec)}` +
        `${ws.avgWorkDistanceKm ? ` (~${ws.avgWorkDistanceKm} km)` : ""}` +
        ` @ ${fmtPace(ws.avgWorkPaceSecPerKm)}, snittpuls i dragene ${ws.avgWorkHr ?? "?"}` +
        `${ws.avgRecoverySec ? `, pauser ~${fmtDur(ws.avgRecoverySec)}` : ""}`
    );
  }

  // Rundeliste: ved svært mange runder (autolap + intervaller) vises kun dragene.
  let listLaps = classified;
  if (classified.length > 30) {
    listLaps = ws ? classified.filter((l) => l.role === "work").slice(0, 30) : [];
  }
  if (listLaps.length > 1) {
    lines.push(classified.length > 30 ? "Runder (kun drag):" : "Runder:");
    for (const l of listLaps) {
      lines.push(
        `  ${l.index}: ${l.distanceKm?.toFixed(2) ?? "?"} km @ ${fmtPace(l.avgPaceSecPerKm)}, puls ${l.avgHr ?? "?"}${ROLE_TAG[l.role] ?? ""}`
      );
    }
  }
  return lines.join("\n");
}

/** Instruks som hindrer at intervalløkter dømmes på snittpuls for hele økten. */
export function intervalGuidance(planned: PlannedSession | null, w: Workout): string {
  const looksLikeIntervals =
    workSummary(classifyLaps(parseLapsJson(w.lapsJson))) != null;
  if (planned?.type !== "quality" && !looksLikeIntervals) return "";
  return `
VIKTIG – DETTE ER EN INTERVALL-/KVALITETSØKT:
Snittpulsen for HELE økten inkluderer oppvarming, pauser mellom dragene og nedjogg, og SKAL derfor ligge godt under målsonen. Det er riktig gjennomføring – ikke underprestasjon. Vurder økten på:
(a) dragene – linjen «Drag (arbeidsintervaller)» og rundene merket [drag]: puls og tempo per drag mot målsone/måltempo,
(b) tid i målsonen fra pulssone-fordelingen (f.eks. 4×3 min terskel ≈ 12 min i målsonen).
Bruk ALDRI snittpulsen for hele økten til å avgjøre om målsonen ble truffet. Rolige pauser er en del av økten og skal roses, ikke trekkes for.`;
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
  const place = workout.name?.trim();
  const zones = computeZones(user.maxHr, user.restHr);

  const userText = `Her er en gjennomført treningsøkt jeg lastet opp fra Garmin.

${plannedContext(planned)}

GJENNOMFØRT ØKT:
${summarizeWorkout(workout, zones)}
${place ? `Sted/navn på økten: ${place}` : ""}
${intervalGuidance(planned, workout)}
${history ? `SISTE ØKTER (kontekst):\n${history}\n` : ""}
SVARET DITT (markdown, norsk):
1) START med en kort, lett humoristisk innledning (1–3 setninger) – gjerne en liten vits eller et passende, motiverende sitat. VARIÉR stilen fra gang til gang så det er gøy å lese: noen ganger en vits, noen ganger et sitat, noen ganger en treffende observasjon fra økten (f.eks. tempo, puls, høydemeter, varighet)${place ? ` eller stedet («${place}»)` : ""}. Du trenger IKKE bruke sted eller øktdata hver gang – bare når det faller naturlig. Ikke vær teit eller kunstig; hold det varmt og ekte.
2) Deretter en blank linje, så en SAKLIG vurdering: Traff jeg hensikten med økten (riktig sone/tempo)? Hva var bra? Er det noe å justere til neste gang? Hold vurderingsdelen til maks ~150 ord.`;

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 900,
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

${summarizeWorkout(workout, computeZones(user.maxHr, user.restHr))}
${intervalGuidance(planned, workout)}`;

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

/** Beskriv en planlagt økt kompakt for AI-kontekst (mål, sone, tempo, distanse). */
function describePlanned(s: PlannedSession): string {
  const fmtPace = (x?: number | null) =>
    x ? `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")} min/km` : null;
  const lines = [
    `Planlagt økt (uke ${s.week}, ${s.phaseName}, type "${s.type}"): ${s.title}`,
    s.description,
    `Dato: ${s.date.toISOString().slice(0, 10)}`,
  ];
  if (s.targetZone) lines.push(`Målsone: ${s.targetZone}`);
  const pr =
    fmtPace(s.targetPaceMinSec) && fmtPace(s.targetPaceMaxSec)
      ? `${fmtPace(s.targetPaceMinSec)}–${fmtPace(s.targetPaceMaxSec)}`
      : null;
  if (pr) lines.push(`Måltempo: ${pr}`);
  if (s.plannedDistanceKm) lines.push(`Planlagt distanse: ${s.plannedDistanceKm} km`);
  return lines.join("\n");
}

/** Spørsmål-og-svar om en PLANLAGT (kommende) økt – f.eks. «bør jeg finne en flat løype?». */
export async function chatAboutPlannedSession(
  user: User,
  session: PlannedSession,
  thread: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const intro = `Kontekst for samtalen — en PLANLAGT, kommende økt (ikke gjennomført ennå):

${describePlanned(session)}

Brukeren kan stille spørsmål om hvordan økten bør gjennomføres (terreng, løype, tempo, oppvarming, vær, utstyr osv.). Svar konkret, praktisk og kort på norsk, tilpasset hensikten med økten og pulssonene over.`;

  const messages = [
    { role: "user" as const, content: intro },
    { role: "assistant" as const, content: "Forstått – jeg kjenner den planlagte økten. Spør i vei." },
    ...thread,
  ];

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 800,
    system: systemBlocks(user),
    messages,
  });
  return textOf(resp);
}

/**
 * Nybegynnervennlig beskrivelse av en planlagt økt: HVORFOR akkurat denne økten
 * er bra for løperen nå – treningseffekter, hvordan den skal kjennes, og til slutt
 * en LITEN del om hvordan klokka settes opp. Skaleres etter hvor sammensatt økten er.
 */
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
    ? `Brukeren har en ${user.watchModel.trim()} – nevn gjerne konkrete menyer/funksjoner den faktisk har.`
    : "Brukeren har ikke oppgitt klokkemodell – hold klokketipsene generelle for vanlige GPS-pulsklokker.";

  // Enkle økter (rolig/langtur) → kort. Kvalitet/intervall/kreative → fyldigere.
  const isSimple = session.type === "easy" || session.type === "long";

  const userText = `Forklar for ${user.nickname} – som IKKE er godt vant med trening – hvorfor nettopp denne planlagte økten er en god økt for henne/ham akkurat nå. Vær konkret, varm og motiverende, og knytt det til hvor i programmet vi er.

ØKT (uke ${session.week}, ${session.phaseName}, type "${session.type}"): ${session.title}
${session.description}
${session.targetZone ? `Målsone: ${session.targetZone}${zoneInfo ? ` (${zoneInfo})` : ""}` : ""}
${paceRange ? `Måltempo: ${paceRange}` : ""}
${session.plannedDistanceKm ? `Planlagt distanse: ${session.plannedDistanceKm} km` : ""}

${watch}

KRAV TIL SVARET (markdown på norsk, vennlig "du"-form):
${
  isSimple
    ? `- Dette er en ENKEL økt. Hold deg kort og lettlest: 1 kort innledning + 3–5 punkter om hva økten gir deg og hvordan den skal kjennes (rolig = rolig!). Ikke overforklar.`
    : `- Dette er en mer SAMMENSATT økt (kvalitet/intervall e.l.). Forklar grundigere, gjerne med en liten tabell "del av økten → hovedeffekt", en kort "Samlet effekt"-liste, og noen "Når og hvordan"-punkter. Hold det ryddig og motiverende.`
}
- Få tydelig fram hva treningseffekten er og hvorfor den passer for en som bygger seg opp mot 10 km – uten unødig fagsjargong (forklar korte begreper hvis du bruker dem).
- Nevn målsonen i bpm${paceRange ? " og forventet tempo" : ""} et naturlig sted, med de EKSAKTE tallene over.
- AVSLUTT med en LITEN egen del med overskrift "### ⌚ Slik setter du opp klokka" – maks 2–4 korte punkter (pulsvarsel/sonealarm, datafelt, og for intervalløkter et raskt ord om intervall-/treningsøkt-funksjonen). Dette skal være en liten hale til slutt, ikke hoveddelen.
- ${isSimple ? "Maks ~180 ord totalt." : "Maks ~320 ord totalt."} Ingen meta-kommentarer om at du er en AI.`;

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 1300,
    system: systemBlocks(user),
    messages: [{ role: "user", content: userText }],
  });
  return textOf(resp);
}

export interface PlanAdjustmentProposal {
  /** Markdown: formvurdering (foran/på sporet/bak forventet) + generell begrunnelse for endringene. */
  evaluation: string;
  changes: {
    sessionId: number;
    field: "description" | "title" | "date";
    before: string;
    after: string;
    /** Kort, konkret hva som endres i denne økten. */
    change: string;
    /** Hvorfor nettopp denne økten endres. */
    reason: string;
  }[];
}

/**
 * Vurder hele treningsperioden (planlagt vs. faktisk) og foreslå tilpasninger av
 * kommende økter. `periodHistory` er en planlagt-vs-faktisk-sammenligning for perioden.
 */
export async function proposePlanAdjustment(
  user: User,
  upcoming: PlannedSession[],
  periodHistory: string
): Promise<PlanAdjustmentProposal> {
  const upcomingText = upcoming
    .map(
      (s) =>
        `#${s.id} (uke ${s.week}, ${s.date.toISOString().slice(0, 10)}, ${s.type}): ${s.title} — ${s.description}` +
        `${s.targetZone ? ` [mål: ${s.targetZone}]` : ""}${s.plannedDistanceKm ? ` [${s.plannedDistanceKm} km]` : ""}`
    )
    .join("\n");

  const tool: Anthropic.Tool = {
    name: "propose_plan_changes",
    description: "Vurder formen mot planen og foreslå konkrete justeringer av kommende økter.",
    input_schema: {
      type: "object",
      properties: {
        evaluation: {
          type: "string",
          description:
            "Markdown på norsk. (1) Vurder formen min mot det som var planlagt/forventet i perioden – ligger jeg FORAN, PÅ SPORET eller BAK, og hvorfor ser du det (vis til faktiske tall mot planlagte)? (2) Gi en generell begrunnelse for OM planen bør endres, og i så fall HVORDAN den endres på overordnet nivå. Vær ærlig og konkret, men oppmuntrende. 2–5 setninger, gjerne et par punkter.",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sessionId: { type: "number" },
              field: { type: "string", enum: ["description", "title", "date"] },
              before: { type: "string" },
              after: { type: "string" },
              change: {
                type: "string",
                description:
                  "Kort, konkret hva som endres i klartekst. F.eks. «Øker langturen fra 6 → 7 km» eller «Senker måltempo til 6:30/km».",
              },
              reason: { type: "string", description: "Kort hvorfor nettopp denne økten endres." },
            },
            required: ["sessionId", "field", "before", "after", "change", "reason"],
          },
        },
      },
      required: ["evaluation", "changes"],
    },
  };

  const resp = await getClient().messages.create({
    model: model(),
    max_tokens: 2000,
    system: systemBlocks(user),
    tools: [tool],
    tool_choice: { type: "tool", name: "propose_plan_changes" },
    messages: [
      {
        role: "user",
        content: `Vurder treningsperioden min så langt og foreslå eventuelle tilpasninger av de kommende øktene.

GJØR SLIK:
1) Sammenlign det jeg FAKTISK har gjort med det som var PLANLAGT/forventet i perioden – tempo, puls/sone, distanse, og om økter er hoppet over.
   MERK om intervall-/kvalitetsøkter: snittpulsen for hele økten SKAL ligge under målsonen (pausene trekker den ned). Bruk «drag: …»- og «min i sone …»-informasjonen der den finnes – ikke snittpulsen – når du vurderer om kvalitetsøkter traff målet.
2) Skriv en kort, ærlig vurdering i "evaluation": ligger formen min foran, på sporet eller bak det forventede – og hvorfor? Gi så en generell begrunnelse for om planen bør endres, og i så fall hvordan (overordnet).
3) Foreslå konkrete endringer KUN der det gir tydelig mening (juster tempo/distanse hvis jeg ligger foran/bak, flytt eller endre en økt hvis jeg har hoppet over flere). Vær konservativ og skadeforebyggende. Hvis alt ser bra ut, returner en tom changes-liste – men gi ALLTID en evaluation.
4) For hver endring: sett "change" til en kort, konkret beskrivelse av hva som endres, og "reason" til hvorfor.

KOMMENDE ØKTER:
${upcomingText || "(ingen kommende økter)"}

TRENINGSHISTORIKK I PERIODEN (planlagt vs. faktisk):
${periodHistory || "(ingen gjennomførte økter ennå)"}`,
      },
    ],
  });

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "propose_plan_changes") {
      return block.input as PlanAdjustmentProposal;
    }
  }
  return { evaluation: "Fikk ikke vurdert planen denne gangen. Prøv igjen.", changes: [] };
}

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
