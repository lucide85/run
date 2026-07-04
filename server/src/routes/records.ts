import { Router } from "express";
import { currentUserId } from "../auth.js";
import { ah } from "../lib/http.js";
import { computeRecords } from "../services/records.js";

export const recordsRouter = Router();

// Personlige rekorder, beregnet fra lagrede økter
recordsRouter.get("/", ah(async (req, res) => {
  const userId = currentUserId(req);
  res.json({ records: await computeRecords(userId) });
}));
