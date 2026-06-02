import { Router } from "express";
import { currentUser } from "../auth.js";
import { generatePlan, type OnboardingAnswers } from "../services/aiPlan.js";

export const onboardingRouter = Router();

// Generer (eller regenerer) en AI-treningsplan basert på svar fra brukeren.
// `force=true` hopper over oppfølgingsspørsmål.
onboardingRouter.post("/generate", async (req, res) => {
  const user = await currentUser(req);
  const answers = req.body?.answers as OnboardingAnswers;
  const force = !!req.body?.force;

  if (!answers?.raceDate || !answers?.raceDistanceKm || !answers?.daysPerWeek) {
    return res.status(400).json({ error: "Mangler løpsdato, distanse eller antall dager per uke" });
  }

  try {
    const result = await generatePlan(user, answers, force);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
