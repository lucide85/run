import { Router } from "express";
import { currentUser } from "../auth.js";
import { ah } from "../lib/http.js";
import { computeFitness } from "../services/fitness.js";

export const fitnessRouter = Router();

// Formkurve (belastning/form/overskudd) + 10 km-prognose
fitnessRouter.get("/", ah(async (req, res) => {
  const user = await currentUser(req);
  res.json(await computeFitness(user));
}));
