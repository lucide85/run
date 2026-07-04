import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { ah } from "../lib/http.js";
import { forecastForDay, type DayForecast } from "../services/weather.js";

export const weatherRouter = Router();

export interface SessionForecast {
  sessionId: number;
  date: string; // YYYY-MM-DD
  forecast: DayForecast | null; // null = utenfor værhorisonten (~9 dager)
}

// Værmelding for kommende planlagte økter (krever hjemsted i Innstillinger)
weatherRouter.get("/upcoming", ah(async (req, res) => {
  const user = await currentUser(req);
  if (user.homeLat == null || user.homeLon == null) {
    return res.json({ configured: false, place: null, sessions: [] });
  }

  const sessions = await prisma.plannedSession.findMany({
    where: { userId: user.id, status: { in: ["planned", "moved"] }, date: { gte: new Date() } },
    orderBy: { date: "asc" },
    take: 12,
  });

  const out: SessionForecast[] = [];
  for (const s of sessions) {
    const dateISO = s.date.toISOString().slice(0, 10); // plandatoer er kl 12 UTC = riktig norsk dag
    let forecast: DayForecast | null = null;
    try {
      forecast = await forecastForDay(user.homeLat, user.homeLon, dateISO);
    } catch (e) {
      console.warn("Værmelding utilgjengelig:", (e as Error).message);
      break; // ikke prøv resten når tjenesten feiler
    }
    out.push({ sessionId: s.id, date: dateISO, forecast });
  }

  res.json({ configured: true, place: user.homePlace ?? null, sessions: out });
}));
