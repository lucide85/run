import { Router } from "express";
import { syncGarmin } from "../services/sync.js";
import { currentUserId } from "../auth.js";

export const syncRouter = Router();

// Trigg synk mot Garmin for innlogget bruker
syncRouter.post("/", async (req, res) => {
  const userId = currentUserId(req);
  const limit = Number(req.body?.limit) || 20;
  try {
    const result = await syncGarmin(userId, limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
