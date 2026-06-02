import { Router } from "express";
import { prisma } from "../db.js";
import { currentUserId } from "../auth.js";

export const weightRouter = Router();

weightRouter.get("/", async (req, res) => {
  const userId = currentUserId(req);
  const logs = await prisma.weightLog.findMany({ where: { userId }, orderBy: { date: "asc" } });
  res.json(logs);
});

weightRouter.post("/", async (req, res) => {
  const userId = currentUserId(req);
  const { date, weightKg } = req.body ?? {};
  if (!date || typeof weightKg !== "number") {
    return res.status(400).json({ error: "date og weightKg kreves" });
  }
  const d = new Date(date);
  const existing = await prisma.weightLog.findFirst({ where: { userId, date: d } });
  const log = existing
    ? await prisma.weightLog.update({ where: { id: existing.id }, data: { weightKg } })
    : await prisma.weightLog.create({ data: { userId, date: d, weightKg } });
  res.json(log);
});

weightRouter.delete("/:id", async (req, res) => {
  const userId = currentUserId(req);
  await prisma.weightLog.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.json({ ok: true });
});
