import { Router } from "express";
import { currentUser } from "../auth.js";
import { ah } from "../lib/http.js";
import { computeRecords } from "../services/records.js";

export const recordsRouter = Router();

// Personlige rekorder, beregnet fra lagrede økter
recordsRouter.get("/", ah(async (req, res) => {
  const user = await currentUser(req);
  res.json({ records: await computeRecords(user) });
}));
