import { Router } from "express";
import { prisma } from "../db.js";
import { currentUserId } from "../auth.js";
import { ah, parseDate } from "../lib/http.js";

export const weightRouter = Router();

weightRouter.get("/", ah(async (req, res) => {
  const userId = currentUserId(req);
  const logs = await prisma.weightLog.findMany({ where: { userId }, orderBy: { date: "asc" } });
  res.json(logs);
}));

weightRouter.post("/", ah(async (req, res) => {
  const userId = currentUserId(req);
  const { date, weightKg } = req.body ?? {};
  if (!date || typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
    return res.status(400).json({ error: "date og weightKg kreves" });
  }
  const parsed = parseDate(date);
  if (!parsed) return res.status(400).json({ error: "Ugyldig dato" });
  // Normaliser til kl 12 UTC på kalenderdagen slik at «én oppføring per dag»
  // faktisk holder – uansett hvilket tidspunkt/tidssoneformat klienten sendte.
  // (Datoen kommer som "YYYY-MM-DD" fra skjemaet – bruk tekstens kalenderdag.)
  const dayStr = typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  const d = dayStr
    ? new Date(`${dayStr}T12:00:00.000Z`)
    : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12));
  // Match både normaliserte og ev. eldre unormaliserte oppføringer samme dag.
  const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0));
  const dayEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  const existing = await prisma.weightLog.findFirst({
    where: { userId, date: { gte: dayStart, lte: dayEnd } },
  });
  const log = existing
    ? await prisma.weightLog.update({ where: { id: existing.id }, data: { weightKg } })
    : await prisma.weightLog.create({ data: { userId, date: d, weightKg } });
  res.json(log);
}));

weightRouter.delete("/:id", ah(async (req, res) => {
  const userId = currentUserId(req);
  await prisma.weightLog.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.json({ ok: true });
}));
