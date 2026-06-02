import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, PlannedSession, Settings, Workout } from "../api/client";
import { Card, PageTitle, Stat, TypeBadge, StatusBadge, Button, Spinner } from "../components/ui";
import { dateNo, dist, pace } from "../lib/format";
import { SyncButton } from "../components/SyncButton";

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [s, w, st] = await Promise.all([api.sessions(), api.workouts(), api.settings()]);
    setSessions(s);
    setWorkouts(w);
    setSettings(st);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !settings) return <Spinner />;

  const thisWeek = isoWeek(new Date());
  const upcoming = sessions
    .filter((s) => s.status === "planned" || s.status === "moved")
    .filter((s) => new Date(s.date) >= new Date(new Date().toDateString()))
    .slice(0, 4);

  const completed = sessions.filter((s) => s.status === "completed").length;
  const total = sessions.length;
  const last7 = workouts.filter(
    (w) => new Date(w.startTime).getTime() > Date.now() - 7 * 86400000
  );
  const weeklyKm = last7.reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);

  return (
    <div>
      <PageTitle
        title="Oversikt"
        subtitle={`Uke ${thisWeek} · ${settings.race.name}${settings.race.date ? ` ${dateNo(settings.race.date)}` : ""}`}
        action={<SyncButton onDone={load} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Dager til løp"
          value={settings.race.date ? daysUntil(settings.race.date) : "–"}
          hint={settings.race.date ? dateNo(settings.race.date) : "ikke satt"}
        />
        <Stat label="Fullførte økter" value={`${completed} / ${total}`} hint="hele programmet" />
        <Stat label="Siste 7 dager" value={`${weeklyKm.toFixed(1)} km`} hint={`${last7.length} økter`} />
        <Stat
          label="Sist synket"
          value={settings.lastSync ? dateNo(settings.lastSync) : "aldri"}
          hint="Garmin"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-slate-700">Kommende økter</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Ingen planlagte økter framover.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <TypeBadge type={s.type} />
                      <span className="text-xs text-slate-400">{dateNo(s.date)}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-700">{s.title}</div>
                  </div>
                  <span className="text-xs text-slate-400">{s.targetZone}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Siste økter</h2>
            <Link to="/okter" className="text-sm text-brand-600 hover:underline">
              Se alle
            </Link>
          </div>
          {workouts.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ingen importerte økter ennå. Trykk «Synk med Garmin».
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {workouts.slice(0, 5).map((w) => (
                <Link
                  key={w.id}
                  to={`/okter/${w.id}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      {w.name || w.sport || "Løp"}
                    </div>
                    <div className="text-xs text-slate-400">{dateNo(w.startTime)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium text-slate-700">{dist(w.distanceKm)}</div>
                    <div className="text-xs text-slate-400">
                      {pace(w.avgPaceSecPerKm)} · {w.avgHr ?? "–"} bpm
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
