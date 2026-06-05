import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import {
  evaluateWorkout,
  chatAboutWorkout,
  proposePlanAdjustment,
  summarizeWorkout,
  generateWatchTips,
  type PlanAdjustmentProposal,
} from "../services/ai.js";

export const aiRouter = Router();

/** Kort historikk fra brukerens siste økter (ekskl. en gitt økt). */
async function recentHistory(userId: number, excludeWorkoutId?: number): Promise<string> {
  const recent = await prisma.workout.findMany({ where: { userId }, orderBy: { startTime: "desc" }, take: 6 });
  return recent
    .filter((w) => w.id !== excludeWorkoutId)
    .slice(0, 5)
    .map((w) => summarizeWorkout(w))
    .join("\n---\n");
}

/** Planlagt-vs-faktisk for HELE treningsperioden – grunnlag for AI-tilpasning. */
async function periodComparison(userId: number): Promise<string> {
  const sessions = await prisma.plannedSession.findMany({
    where: { userId, status: { in: ["completed", "skipped"] } },
    orderBy: { date: "asc" },
    include: { workout: true },
  });
  if (sessions.length === 0) return "(ingen gjennomførte økter ennå)";

  const fmtPace = (s?: number | null) =>
    s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "?";

  return sessions
    .map((s) => {
      const plan =
        `planlagt: ${s.targetZone ?? "sone ?"}` +
        `${s.targetPaceMinSec ? `, ${fmtPace(s.targetPaceMinSec)}–${fmtPace(s.targetPaceMaxSec)}/km` : ""}` +
        `${s.plannedDistanceKm ? `, ${s.plannedDistanceKm} km` : ""}`;
      const head = `Uke ${s.week} [${s.type}] ${s.title}`;
      if (s.status === "skipped") return `${head}: HOPPET OVER (${plan})`;
      const w = s.workout;
      const act = w
        ? `faktisk: ${w.distanceKm?.toFixed(2) ?? "?"} km @ ${fmtPace(w.avgPaceSecPerKm)}/km, snittpuls ${w.avgHr ?? "?"}${w.maxHr ? `/maks ${w.maxHr}` : ""}`
        : "faktisk: (fullført, men ingen øktdata)";
      return `${head}: ${plan} → ${act}`;
    })
    .join("\n");
}

// Generer (eller regenerer) AI-vurdering av en økt
aiRouter.post("/workouts/:id/evaluate", async (req, res) => {
  const user = await currentUser(req);
  const id = Number(req.params.id);
  const workout = await prisma.workout.findFirst({
    where: { id, userId: user.id },
    include: { plannedSession: true },
  });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });

  try {
    const history = await recentHistory(user.id, id);
    const feedback = await evaluateWorkout(user, workout, workout.plannedSession, history);
    const msg = await prisma.aiMessage.create({
      data: { workoutId: id, role: "assistant", content: feedback, kind: "feedback" },
    });
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Hent alle AI-meldinger for en økt
aiRouter.get("/workouts/:id/messages", async (req, res) => {
  const user = await currentUser(req);
  const workout = await prisma.workout.findFirst({ where: { id: Number(req.params.id), userId: user.id } });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });
  const messages = await prisma.aiMessage.findMany({
    where: { workoutId: workout.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

// Still oppfølgingsspørsmål om en økt
aiRouter.post("/workouts/:id/chat", async (req, res) => {
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
    res.status(500).json({ error: (e as Error).message });
  }
});

// Pulsklokke-tips for en planlagt økt (caches per økt + klokkemodell)
aiRouter.post("/sessions/:id/watch-tips", async (req, res) => {
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
    const tips = await generateWatchTips(user, session);
    await prisma.plannedSession.update({
      where: { id },
      data: { watchTips: tips, watchTipsFor: cacheKey },
    });
    res.json({ tips, cached: false });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Be AI foreslå justeringer av kommende økter
aiRouter.post("/plan/propose", async (req, res) => {
  const user = await currentUser(req);
  try {
    const upcoming = await prisma.plannedSession.findMany({
      where: { userId: user.id, status: { in: ["planned", "moved"] }, date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 9,
    });
    const history = await periodComparison(user.id);
    const proposal = await proposePlanAdjustment(user, upcoming, history);
    res.json(proposal);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Godta og bruk foreslåtte planendringer
aiRouter.post("/plan/apply", async (req, res) => {
  const user = await currentUser(req);
  const proposal = req.body as PlanAdjustmentProposal;
  if (!proposal?.changes) return res.status(400).json({ error: "Ugyldig forslag" });

  for (const c of proposal.changes) {
    const data: Record<string, unknown> = { aiAdjusted: true };
    if (c.field === "date") data.date = new Date(c.after);
    else data[c.field] = c.after;
    // Bare oppdater økter som tilhører brukeren
    await prisma.plannedSession.updateMany({ where: { id: c.sessionId, userId: user.id }, data });
  }

  const change = await prisma.planChange.create({
    data: { userId: user.id, summary: proposal.evaluation, diffJson: JSON.stringify(proposal.changes), accepted: true },
  });
  res.json({ ok: true, change });
});

// Historikk over planendringer
aiRouter.get("/plan/changes", async (req, res) => {
  const user = await currentUser(req);
  const changes = await prisma.planChange.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  res.json(changes);
});
