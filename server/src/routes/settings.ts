import { Router } from "express";
import { prisma } from "../db.js";
import { loadConfig } from "../config.js";
import { currentUser } from "../auth.js";
import { regenerateDates } from "../services/plan.js";
import { encrypt } from "../lib/crypto.js";
import { clearGarminClient, beginGarminLogin, completeGarminMfa } from "../services/garmin.js";

export const settingsRouter = Router();

// Innstillinger for innlogget bruker (config gir kun standarder/feature-flagg)
settingsRouter.get("/", async (req, res) => {
  const cfg = loadConfig();
  const user = await currentUser(req);
  res.json({
    race: { name: user.raceName ?? cfg.race.name, date: user.raceDate ?? null },
    training: {
      startDate: cfg.training.startDate,
      days: user.trainingDaysJson ? JSON.parse(user.trainingDaysJson) : cfg.training.days,
      maxHr: user.maxHr,
      restHr: user.restHr,
      watchModel: user.watchModel ?? "",
    },
    role: user.role,
    nickname: user.nickname,
    garminConnected: !!user.garminPasswordEnc,
    googleEnabled: cfg.google.enabled,
    lastSync: user.lastGarminSync,
  });
});

// Oppdater treningsdager / pulsverdier
settingsRouter.put("/", async (req, res) => {
  const user = await currentUser(req);
  const { days, maxHr, restHr, watchModel } = req.body ?? {};
  const data: Record<string, unknown> = {};
  let regenerate = false;

  if (Array.isArray(days) && days.length >= 1) {
    data.trainingDaysJson = JSON.stringify(days);
    regenerate = true;
  }
  if (typeof maxHr === "number") data.maxHr = maxHr;
  if (typeof restHr === "number") data.restHr = restHr;
  if (typeof watchModel === "string") data.watchModel = watchModel.trim() || null;

  await prisma.user.update({ where: { id: user.id }, data });
  if (regenerate) await regenerateDates(user.id, days);

  res.json({ ok: true, regenerated: regenerate });
});

// Koble (eller oppdatere) Garmin-konto for innlogget bruker.
// Logger inn med en gang; hvis kontoen har to-faktor returneres mfaRequired,
// og klienten må sende koden til POST /garmin/mfa.
settingsRouter.post("/garmin", async (req, res) => {
  const user = await currentUser(req);
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email og password kreves" });

  try {
    const { mfaRequired } = await beginGarminLogin(user.id, email, password);
    // Lagre innlogging (kryptert) så sesjonen kan fornyes automatisk senere.
    await prisma.user.update({
      where: { id: user.id },
      data: { garminEmail: email, garminPasswordEnc: encrypt(password) },
    });
    clearGarminClient(user.id);
    res.json({ ok: true, mfaRequired });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Fullfør to-faktor-innlogging med sikkerhetskoden brukeren mottok.
settingsRouter.post("/garmin/mfa", async (req, res) => {
  const user = await currentUser(req);
  const { code } = req.body ?? {};
  if (!code || !String(code).trim()) return res.status(400).json({ error: "code kreves" });

  try {
    await completeGarminMfa(user.id, String(code).trim());
    clearGarminClient(user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Koble fra Garmin
settingsRouter.delete("/garmin", async (req, res) => {
  const user = await currentUser(req);
  await prisma.user.update({
    where: { id: user.id },
    data: { garminEmail: null, garminPasswordEnc: null, garminSessionJson: null },
  });
  clearGarminClient(user.id);
  res.json({ ok: true });
});
