import { prisma } from "../db.js";
import { loadConfig } from "../config.js";
import { PROGRAM, deriveTargets } from "../data/program.js";

const WEEKDAY_OFFSET: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/** Lag en UTC-dato kl 12:00 for å unngå tidssone/DST-skred. */
function utcNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

function parseStartMonday(startDate: string): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  const dt = utcNoon(y, m - 1, d);
  // Juster til mandag i samme uke (getUTCDay: 0=søn..6=lør)
  const day = dt.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt;
}

function addDays(base: Date, days: number): Date {
  const dt = new Date(base);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

/** Sorterte ukedags-offsets (fra mandag) for de valgte treningsdagene. */
function sortedDayOffsets(days: string[]): number[] {
  return days
    .map((d) => WEEKDAY_OFFSET[d])
    .filter((n) => n !== undefined)
    .sort((a, b) => a - b);
}

/** Beregn dato for en gitt uke/slot ut fra startdato og valgte treningsdager. */
export function sessionDate(
  startMonday: Date,
  dayOffsets: number[],
  week: number,
  slot: number
): Date {
  const weekStart = addDays(startMonday, (week - 1) * 7);
  const offset = dayOffsets[(slot - 1) % dayOffsets.length] ?? (slot - 1) * 2;
  return addDays(weekStart, offset);
}

/** Seeder hele programmet for en bruker hvis brukeren ikke har en plan. */
export async function seedProgram(userId: number, force = false): Promise<number> {
  const existing = await prisma.plannedSession.count({ where: { userId } });
  if (existing > 0 && !force) return 0;
  if (force) {
    await prisma.plannedSession.deleteMany({ where: { userId } });
  }

  const cfg = loadConfig();
  const startMonday = parseStartMonday(cfg.training.startDate);
  const dayOffsets = sortedDayOffsets(cfg.training.days);
  const raceDate = cfg.race.date;

  let created = 0;
  for (const w of PROGRAM) {
    for (const s of w.sessions) {
      const targets = deriveTargets(s.type, s.description);
      let date = sessionDate(startMonday, dayOffsets, w.week, s.slot);
      if (s.type === "race") {
        const [ry, rm, rd] = raceDate.split("-").map(Number);
        date = utcNoon(ry, rm - 1, rd);
      }
      await prisma.plannedSession.create({
        data: {
          userId,
          week: w.week,
          phase: w.phase,
          phaseName: w.phaseName,
          type: s.type,
          slot: s.slot,
          title: s.title,
          description: s.description,
          targetZone: targets.zone,
          targetPaceMinSec: targets.paceMinSec ?? null,
          targetPaceMaxSec: targets.paceMaxSec ?? null,
          plannedDistanceKm: s.distanceKm ?? null,
          date,
          status: "planned",
        },
      });
      created++;
    }
  }
  return created;
}

/**
 * Engangs/idempotent opprydding: en planlagt økt som er koblet til en registrert økt
 * SKAL være "completed" og ligge på øktens faktiske dato. Eldre data kan stå som
 * "moved"/"planned" fra før låsingen ble innført – dette forener dem. Trygt å kjøre hver oppstart.
 */
export async function reconcileLinkedSessions(): Promise<number> {
  const stale = await prisma.plannedSession.findMany({
    where: { workoutId: { not: null }, status: { not: "completed" } },
    include: { workout: true },
  });
  for (const s of stale) {
    const when = s.workout?.startTime;
    const date = when
      ? new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), 12))
      : s.date;
    await prisma.plannedSession.update({ where: { id: s.id }, data: { status: "completed", date } });
  }
  return stale.length;
}

/** Regenererer datoer ut fra (nye) treningsdager. Forankres på brukerens egen plan-start. */
export async function regenerateDates(userId: number, days: string[]): Promise<void> {
  const sessions = await prisma.plannedSession.findMany({ where: { userId } });
  if (sessions.length === 0) return;

  // Forankre på mandagen i uken til den tidligste økten (uavhengig av config)
  const earliest = sessions.reduce((min, s) => (s.date < min ? s.date : min), sessions[0].date);
  const anchor = new Date(earliest);
  const day = anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const minWeek = Math.min(...sessions.map((s) => s.week));
  const startMonday = addDays(anchor, -(minWeek - 1) * 7);

  const dayOffsets = sortedDayOffsets(days);
  for (const s of sessions) {
    if (s.type === "race") continue; // løpsdagen er låst
    if (s.status === "moved") continue; // ikke overstyr manuelt flyttede økter
    if (s.status === "completed") continue; // fullførte økter beholder sin faktiske dato
    const date = sessionDate(startMonday, dayOffsets, s.week, s.slot);
    await prisma.plannedSession.update({ where: { id: s.id }, data: { date } });
  }
}
