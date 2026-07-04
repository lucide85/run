import { Router } from "express";
import { syncGarmin } from "../services/sync.js";
import { currentUserId } from "../auth.js";
import { ah } from "../lib/http.js";

export const syncRouter = Router();

// Trigg synk mot Garmin for innlogget bruker
syncRouter.post("/", ah(async (req, res) => {
  const userId = currentUserId(req);
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);
  try {
    const result = await syncGarmin(userId, limit);
    res.json(result);
  } catch (e) {
    // Garmin-feil er relevante for brukeren (f.eks. utløpt innlogging) – behold meldingen
    console.error("Garmin-synk feilet:", e);
    res.status(500).json({ error: (e as Error).message });
  }
}));
