import { Router } from "express";
import { prisma } from "../db.js";
import { PROGRAM, PHASE_GOALS, HR_ZONES } from "../data/program.js";
import { currentUserId } from "../auth.js";

export const planRouter = Router();

// Statisk programstruktur (faser, soner) for visning
planRouter.get("/structure", (_req, res) => {
  res.json({ program: PROGRAM, phaseGoals: PHASE_GOALS, hrZones: HR_ZONES });
});

// Alle planlagte økter for innlogget bruker (med ev. koblet økt)
planRouter.get("/sessions", async (req, res) => {
  const userId = currentUserId(req);
  const sessions = await prisma.plannedSession.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    include: { workout: true },
  });
  res.json(sessions);
});

// Én planlagt økt
planRouter.get("/sessions/:id", async (req, res) => {
  const userId = currentUserId(req);
  const session = await prisma.plannedSession.findFirst({
    where: { id: Number(req.params.id), userId },
    include: { workout: true },
  });
  if (!session) return res.status(404).json({ error: "Ikke funnet" });
  res.json(session);
});

// Oppdater en planlagt økt (flytt dato, endre status, notat)
planRouter.patch("/sessions/:id", async (req, res) => {
  const userId = currentUserId(req);
  const id = Number(req.params.id);
  const { date, status, notes } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (date !== undefined) {
    data.date = new Date(date);
    data.status = status ?? "moved";
  }
  if (status !== undefined) data.status = status;
  if (notes !== undefined) data.notes = notes;

  // Sikre eierskap før oppdatering
  const owned = await prisma.plannedSession.findFirst({ where: { id, userId } });
  if (!owned) return res.status(404).json({ error: "Ikke funnet" });
  const updated = await prisma.plannedSession.update({ where: { id }, data });
  res.json(updated);
});
