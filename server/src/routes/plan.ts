import { Router } from "express";
import { prisma } from "../db.js";
import { PROGRAM, PHASE_GOALS, HR_ZONES } from "../data/program.js";
import { currentUserId } from "../auth.js";
import { ah, parseDate } from "../lib/http.js";
import { osloNoon } from "../lib/dates.js";

export const planRouter = Router();

const SESSION_STATUSES = new Set(["planned", "completed", "skipped", "moved"]);

// Statisk programstruktur (faser, soner) for visning
planRouter.get("/structure", (_req, res) => {
  res.json({ program: PROGRAM, phaseGoals: PHASE_GOALS, hrZones: HR_ZONES });
});

// Alle planlagte økter for innlogget bruker (med ev. koblet økt)
planRouter.get("/sessions", ah(async (req, res) => {
  const userId = currentUserId(req);
  const sessions = await prisma.plannedSession.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    include: { workout: true },
  });
  res.json(sessions);
}));

// Én planlagt økt
planRouter.get("/sessions/:id", ah(async (req, res) => {
  const userId = currentUserId(req);
  const session = await prisma.plannedSession.findFirst({
    where: { id: Number(req.params.id), userId },
    include: { workout: true },
  });
  if (!session) return res.status(404).json({ error: "Ikke funnet" });
  res.json(session);
}));

// Oppdater en planlagt økt (flytt dato, endre status, notat)
planRouter.patch("/sessions/:id", ah(async (req, res) => {
  const userId = currentUserId(req);
  const id = Number(req.params.id);
  const { date, status, notes } = req.body ?? {};

  // Sikre eierskap før oppdatering
  const owned = await prisma.plannedSession.findFirst({ where: { id, userId } });
  if (!owned) return res.status(404).json({ error: "Ikke funnet" });

  // En fullført økt som er koblet til en Garmin-økt er LÅST: dato/status kan ikke endres
  // før selve økten slettes (da frigjøres og tilbakestilles den planlagte økten automatisk).
  const locked = owned.status === "completed" && owned.workoutId != null;
  const wantsDateOrStatus = date !== undefined || status !== undefined;
  if (locked && wantsDateOrStatus) {
    return res.status(409).json({
      error:
        "Økten er fullført og koblet til en registrert økt, og kan derfor ikke flyttes eller endre status. Slett den tilkoblede økten først hvis du vil endre dette.",
      locked: true,
    });
  }

  const data: Record<string, unknown> = {};
  if (date !== undefined) {
    const d = parseDate(date);
    if (!d) return res.status(400).json({ error: "Ugyldig dato" });
    data.date = d;
    data.status = status ?? "moved";
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !SESSION_STATUSES.has(status)) {
      return res.status(400).json({ error: "Ugyldig status" });
    }
    data.status = status;
  }
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "Ugyldig notat" });
    }
    data.notes = notes; // notat er alltid tillatt
  }

  const updated = await prisma.plannedSession.update({ where: { id }, data });
  res.json(updated);
}));

// Manuell kobling: velg hvilken treningsøkt som hører til denne planlagte økten
// (workoutId = null fjerner koblingen). Overstyrer auto-matchingen.
planRouter.patch("/sessions/:id/link", ah(async (req, res) => {
  const userId = currentUserId(req);
  const id = Number(req.params.id);
  const { workoutId } = req.body ?? {};

  const owned = await prisma.plannedSession.findFirst({ where: { id, userId } });
  if (!owned) return res.status(404).json({ error: "Ikke funnet" });

  // Fjern kobling → tilbake til planlagt
  if (workoutId == null) {
    const updated = await prisma.plannedSession.update({
      where: { id },
      data: { workoutId: null, status: "planned" },
      include: { workout: true },
    });
    return res.json(updated);
  }

  const workout = await prisma.workout.findFirst({ where: { id: Number(workoutId), userId } });
  if (!workout) return res.status(404).json({ error: "Treningsøkt ikke funnet" });

  // Fullført-dato = øktens faktiske NORSKE kalenderdag (kl 12 UTC, konsistent med resten)
  const doneDate = osloNoon(workout.startTime);

  // workoutId er unik på planlagt økt: frigjør evt. annen økt som allerede peker på denne
  // treningsøkten, før vi kobler den hit. Gjøres i én transaksjon.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.plannedSession.updateMany({
      where: { workoutId: Number(workoutId), userId, id: { not: id } },
      data: { workoutId: null, status: "planned" },
    });
    return tx.plannedSession.update({
      where: { id },
      data: { workoutId: Number(workoutId), status: "completed", date: doneDate },
      include: { workout: true },
    });
  });
  res.json(updated);
}));
