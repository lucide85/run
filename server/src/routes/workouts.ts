import { Router } from "express";
import { prisma } from "../db.js";
import { currentUserId } from "../auth.js";
import { ah } from "../lib/http.js";
import { classifyLaps, parseLapsJson, workSummary } from "../services/intervals.js";

export const workoutsRouter = Router();

function safeJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Alle økter (uten tunge strøm-data)
workoutsRouter.get("/", ah(async (req, res) => {
  const userId = currentUserId(req);
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { startTime: "desc" },
    select: {
      id: true, garminActivityId: true, startTime: true, sport: true, name: true,
      distanceKm: true, durationSec: true, avgHr: true, maxHr: true,
      avgPaceSecPerKm: true, elevationGainM: true, avgCadence: true, calories: true,
      hrZoneSecondsJson: true, plannedSession: true,
    },
  });
  res.json(workouts);
}));

// Én økt med full detalj (strøm, runder, AI-meldinger)
workoutsRouter.get("/:id", ah(async (req, res) => {
  const userId = currentUserId(req);
  const workout = await prisma.workout.findFirst({
    where: { id: Number(req.params.id), userId },
    include: { plannedSession: true, aiMessages: { orderBy: { createdAt: "asc" } } },
  });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });

  // Runder beriket med drag/pause-rolle (ekte FIT-flagg eller heuristikk) –
  // fungerer også for allerede importerte økter uten re-import.
  const laps = classifyLaps(parseLapsJson(workout.lapsJson));

  res.json({
    ...workout,
    streams: safeJson(workout.streamsJson, [] as unknown[]),
    laps,
    workSummary: workSummary(laps),
    hrZoneSeconds: safeJson(workout.hrZoneSecondsJson, {} as Record<string, number>),
  });
}));

// Slett en økt. Som standard ignoreres Garmin-aktiviteten så den ikke synkes inn igjen.
// Send ?resync=true for å tillate at den hentes på nytt ved neste synk.
workoutsRouter.delete("/:id", ah(async (req, res) => {
  const userId = currentUserId(req);
  const workout = await prisma.workout.findFirst({ where: { id: Number(req.params.id), userId } });
  if (!workout) return res.status(404).json({ error: "Ikke funnet" });

  const allowResync = req.query.resync === "true";

  // Koble fra en evt. planlagt økt og sett den tilbake til "planlagt"
  await prisma.plannedSession.updateMany({
    where: { workoutId: workout.id },
    data: { workoutId: null, status: "planned" },
  });

  if (!allowResync && workout.garminActivityId) {
    await prisma.ignoredActivity.upsert({
      where: { userId_garminActivityId: { userId: userId!, garminActivityId: workout.garminActivityId } },
      update: {},
      create: { userId, garminActivityId: workout.garminActivityId, reason: "Slettet av bruker" },
    });
  }

  await prisma.workout.delete({ where: { id: workout.id } });
  res.json({ ok: true, ignored: !allowResync });
}));
