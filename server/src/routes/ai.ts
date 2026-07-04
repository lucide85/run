import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { ah, parseDate } from "../lib/http.js";
import { recentHistory, periodComparison } from "../services/history.js";
import { forecastForDay, describeForecast } from "../services/weather.js";
import {
  evaluateWorkout,
  chatAboutWorkout,
  chatAboutPlannedSession,
  proposePlanAdjustment,
  generateWatchTips,
  type PlanAdjustmentProposal,
} from "../services/ai.js";
import {
  regeneratePlanProposal,
  applyRegeneratedPlan,
  type RegenerateOptions,
} from "../services/aiPlan.js";

export const aiRouter = Router();

// Generer (eller regenerer) AI-vurdering av en økt
aiRouter.post("/workouts/:id/evaluate", ah(async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const workout = await prisma.workout.findFirst({
    where: { id, userId: user.id },
    include: { plannedSession: true },
  });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });

  try {
    const history = await recentHistory(user, id);
    const feedback = await evaluateWorkout(user, workout, workout.plannedSession, history);
    const msg = await prisma.aiMessage.create({
      data: { workoutId: id, role: "assistant", content: feedback, kind: "feedback" },
    });
    res.json(msg);
  } catch (e) {
    console.error("AI-vurdering feilet:", e);
    res.status(500).json({ error: "Kunne ikke generere AI-vurdering. Prøv igjen." });
  }
}));

// Hent alle AI-meldinger for en økt
aiRouter.get("/workouts/:id/messages", ah(async (req, res) => {
  const user = await currentUser(req);
  const workout = await prisma.workout.findFirst({ where: { id: Number(req.params.id), userId: user.id } });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });
  const messages = await prisma.aiMessage.findMany({
    where: { workoutId: workout.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
}));

// Still oppfølgingsspørsmål om en økt
aiRouter.post("/workouts/:id/chat", ah(async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message kreves" });

  const workout = await prisma.workout.findFirst({
    where: { id, userId: user.id },
    include: { plannedSession: true },
  });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });

  try {
    await prisma.aiMessage.create({ data: { workoutId: id, role: "user", content: message, kind: "chat" } });

    const prior = await prisma.aiMessage.findMany({ where: { workoutId: id }, orderBy: { createdAt: "asc" } });
    const thread = prior
      .filter((m) => m.kind !== "plan_adjustment")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const reply = await chatAboutWorkout(user, workout, workout.plannedSession, thread);
    const msg = await prisma.aiMessage.create({
      data: { workoutId: id, role: "assistant", content: reply, kind: "chat" },
    });
    res.json(msg);
  } catch (e) {
    console.error("AI-chat feilet:", e);
    res.status(500).json({ error: "Kunne ikke få svar fra AI akkurat nå. Prøv igjen." });
  }
}));

// Pulsklokke-tips for en planlagt økt (caches per økt + klokkemodell)
aiRouter.post("/sessions/:id/watch-tips", ah(async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const force = req.query.force === "true" || req.body?.force === true;

  const session = await prisma.plannedSession.findFirst({ where: { id, userId: user.id } });
  if (!session) return res.status(404).json({ error: "Ikke funnet" });

  const cacheKey = user.watchModel?.trim() ?? "";
  if (!force && session.watchTips && session.watchTipsFor === cacheKey) {
    return res.json({ tips: session.watchTips, cached: true });
  }

  try {
    // Værmelding for øktdagen flettes inn når hjemsted er satt og datoen
    // er innenfor yr-horisonten (~9 dager). Feiler stille.
    let weatherText: string | null = null;
    if (user.homeLat != null && user.homeLon != null) {
      try {
        const f = await forecastForDay(user.homeLat, user.homeLon, session.date.toISOString().slice(0, 10));
        if (f) weatherText = describeForecast(f);
      } catch {
        weatherText = null;
      }
    }
    const tips = await generateWatchTips(user, session, weatherText);
    await prisma.plannedSession.update({
      where: { id },
      data: { watchTips: tips, watchTipsFor: cacheKey },
    });
    res.json({ tips, cached: false });
  } catch (e) {
    console.error("Klokketips feilet:", e);
    res.status(500).json({ error: "Kunne ikke generere klokketips. Prøv igjen." });
  }
}));

// Hent AI-chat-meldinger for en PLANLAGT økt
aiRouter.get("/sessions/:id/messages", ah(async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const session = await prisma.plannedSession.findFirst({ where: { id, userId: user.id } });
  if (!session) return res.status(404).json({ error: "Ikke funnet" });
  const messages = await prisma.aiMessage.findMany({
    where: { plannedSessionId: id, kind: "plan_chat" },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
}));

// Still et spørsmål til AI om en PLANLAGT økt
aiRouter.post("/sessions/:id/chat", ah(async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message kreves" });

  const session = await prisma.plannedSession.findFirst({ where: { id, userId: user.id } });
  if (!session) return res.status(404).json({ error: "Ikke funnet" });

  try {
    await prisma.aiMessage.create({
      data: { plannedSessionId: id, role: "user", content: message, kind: "plan_chat" },
    });

    const prior = await prisma.aiMessage.findMany({
      where: { plannedSessionId: id, kind: "plan_chat" },
      orderBy: { createdAt: "asc" },
    });
    const thread = prior.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const reply = await chatAboutPlannedSession(user, session, thread);
    const msg = await prisma.aiMessage.create({
      data: { plannedSessionId: id, role: "assistant", content: reply, kind: "plan_chat" },
    });
    res.json(msg);
  } catch (e) {
    console.error("AI-chat (planlagt økt) feilet:", e);
    res.status(500).json({ error: "Kunne ikke få svar fra AI akkurat nå. Prøv igjen." });
  }
}));

// Be AI foreslå justeringer av kommende økter
aiRouter.post("/plan/propose", ah(async (req, res) => {
  const user = await currentUser(req);
  try {
    const upcoming = await prisma.plannedSession.findMany({
      where: { userId: user.id, status: { in: ["planned", "moved"] }, date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 9,
    });
    const history = await periodComparison(user);
    const proposal = await proposePlanAdjustment(user, upcoming, history);
    res.json(proposal);
  } catch (e) {
    console.error("Planforslag feilet:", e);
    res.status(500).json({ error: "Kunne ikke vurdere planen akkurat nå. Prøv igjen." });
  }
}));

// Lag et FORSLAG til regenerert program (fra i dag til løp). Lagrer ingenting.
aiRouter.post("/plan/regenerate", ah(async (req, res) => {
  const user = await currentUser(req);
  const { instructions, raceName, raceDate, raceDistanceKm } = req.body ?? {};
  if (!raceName || !raceDate || !(Number(raceDistanceKm) > 0)) {
    return res.status(400).json({ error: "raceName, raceDate og raceDistanceKm kreves" });
  }
  try {
    const opts: RegenerateOptions = {
      instructions: typeof instructions === "string" ? instructions : undefined,
      raceName: String(raceName),
      raceDate: String(raceDate),
      raceDistanceKm: Number(raceDistanceKm),
    };
    const proposal = await regeneratePlanProposal(user, opts);
    res.json(proposal);
  } catch (e) {
    console.error("Plan-regenerering feilet:", e);
    res.status(500).json({ error: "Kunne ikke generere nytt program akkurat nå. Prøv igjen." });
  }
}));

// Godta og bytt ut programmet fra i dag til løp (beholder fullførte økter)
aiRouter.post("/plan/regenerate/apply", ah(async (req, res) => {
  const user = await currentUser(req);
  const { weeks, raceName, raceDate, raceDistanceKm } = req.body ?? {};
  if (!Array.isArray(weeks) || !raceName || !raceDate || !(Number(raceDistanceKm) > 0)) {
    return res.status(400).json({ error: "weeks, raceName, raceDate og raceDistanceKm kreves" });
  }
  try {
    const opts: RegenerateOptions = {
      raceName: String(raceName),
      raceDate: String(raceDate),
      raceDistanceKm: Number(raceDistanceKm),
    };
    const result = await applyRegeneratedPlan(user, weeks, opts);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("Plan-regenerering (apply) feilet:", e);
    const msg = e instanceof Error && e.name === "ValidationError" ? e.message : "Kunne ikke bytte ut programmet. Ingen endringer er gjort.";
    res.status(e instanceof Error && e.name === "ValidationError" ? 400 : 500).json({ error: msg });
  }
}));

// Felter AI-forslag har lov til å endre – speiler tool-skjemaet i services/ai.ts.
// (Uten denne kunne en innlogget bruker sette vilkårlige felter, inkl. userId/workoutId.)
const APPLY_ALLOWED_FIELDS = new Set(["description", "title", "date"]);

// Godta og bruk foreslåtte planendringer
aiRouter.post("/plan/apply", ah(async (req, res) => {
  const user = await currentUser(req);
  const proposal = req.body as PlanAdjustmentProposal;
  if (!proposal?.changes || !Array.isArray(proposal.changes)) {
    return res.status(400).json({ error: "Ugyldig forslag" });
  }

  for (const c of proposal.changes) {
    if (!APPLY_ALLOWED_FIELDS.has(c.field) || typeof c.sessionId !== "number") continue;
    const data: Record<string, unknown> = { aiAdjusted: true };
    if (c.field === "date") {
      const d = parseDate(c.after);
      if (!d) continue;
      data.date = d;
    } else {
      if (typeof c.after !== "string") continue;
      data[c.field] = c.after;
    }
    // Bare oppdater økter som tilhører brukeren
    await prisma.plannedSession.updateMany({ where: { id: c.sessionId, userId: user.id }, data });
  }

  const change = await prisma.planChange.create({
    data: { userId: user.id, summary: String(proposal.evaluation ?? ""), diffJson: JSON.stringify(proposal.changes), accepted: true },
  });
  res.json({ ok: true, change });
}));

// Historikk over planendringer
aiRouter.get("/plan/changes", ah(async (req, res) => {
  const user = await currentUser(req);
  const changes = await prisma.planChange.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  res.json(changes);
}));
