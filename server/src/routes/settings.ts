import { Router } from "express";
import { prisma } from "../db.js";
import { loadConfig } from "../config.js";
import { currentUser } from "../auth.js";
import { regenerateDates } from "../services/plan.js";
import { encrypt } from "../lib/crypto.js";
import { clearGarminClient, beginGarminLogin, completeGarminMfa } from "../services/garmin.js";
import { ah } from "../lib/http.js";

export const settingsRouter = Router();

// Innstillinger for innlogget bruker (config gir kun standarder/feature-flagg)
settingsRouter.get("/", ah(async (req, res) => {
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
    home: { lat: user.homeLat, lon: user.homeLon, place: user.homePlace },
    limitHistoryToPlan: user.limitHistoryToPlan,
  });
}));

// Oppdater treningsdager / pulsverdier
settingsRouter.put("/", ah(async (req, res) => {
  const user = await currentUser(req);
  const { days, maxHr, restHr, watchModel, homeLat, homeLon, homePlace, limitHistoryToPlan } =
    req.body ?? {};
  const data: Record<string, unknown> = {};
  let regenerate = false;

  if (typeof limitHistoryToPlan === "boolean") data.limitHistoryToPlan = limitHistoryToPlan;

  if (Array.isArray(days) && days.length >= 1) {
    data.trainingDaysJson = JSON.stringify(days);
    regenerate = true;
  }
  if (typeof maxHr === "number") data.maxHr = maxHr;
  if (typeof restHr === "number") data.restHr = restHr;
  if (typeof watchModel === "string") data.watchModel = watchModel.trim() || null;

  // Hjemsted for værmelding: begge koordinater (gyldige) eller null for å fjerne
  if (homeLat === null && homeLon === null) {
    data.homeLat = null;
    data.homeLon = null;
    data.homePlace = null;
  } else if (typeof homeLat === "number" && typeof homeLon === "number") {
    if (homeLat < -90 || homeLat > 90 || homeLon < -180 || homeLon > 180) {
      return res.status(400).json({ error: "Ugyldige koordinater" });
    }
    data.homeLat = homeLat;
    data.homeLon = homeLon;
    if (typeof homePlace === "string") data.homePlace = homePlace.trim() || null;
  }

  await prisma.user.update({ where: { id: user.id }, data });
  if (regenerate) await regenerateDates(user.id, days);

  res.json({ ok: true, regenerated: regenerate });
}));

// Koble (eller oppdatere) Garmin-konto for innlogget bruker.
// Logger inn med en gang; hvis kontoen har to-faktor returneres mfaRequired,
// og klienten må sende koden til POST /garmin/mfa.
settingsRouter.post("/garmin", ah(async (req, res) => {
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
}));

// Fullfør to-faktor-innlogging med sikkerhetskoden brukeren mottok.
settingsRouter.post("/garmin/mfa", ah(async (req, res) => {
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
}));

// Koble fra Garmin
settingsRouter.delete("/garmin", ah(async (req, res) => {
  const user = await currentUser(req);
  await prisma.user.update({
    where: { id: user.id },
    data: { garminEmail: null, garminPasswordEnc: null, garminSessionJson: null },
  });
  clearGarminClient(user.id);
  res.json({ ok: true });
}));
