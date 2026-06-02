import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Workout } from "../api/client";
import { Card, PageTitle, Spinner } from "../components/ui";
import { SyncButton } from "../components/SyncButton";
import { dateNo, dist, duration, pace } from "../lib/format";

export default function Workouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setWorkouts(await api.workouts());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="Økter" subtitle={`${workouts.length} importerte økter`} action={<SyncButton onDone={load} />} />

      {workouts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            Ingen økter ennå. Trykk «Synk med Garmin» for å importere fra Garmin Connect.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Dato</th>
                <th className="px-4 py-3">Økt</th>
                <th className="px-4 py-3 text-right">Distanse</th>
                <th className="px-4 py-3 text-right">Tid</th>
                <th className="px-4 py-3 text-right">Tempo</th>
                <th className="px-4 py-3 text-right">Puls</th>
              </tr>
            </thead>
            <tbody>
              {workouts.map((w) => (
                <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{dateNo(w.startTime)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/okter/${w.id}`} className="font-medium text-brand-600 hover:underline">
                      {w.name || w.sport || "Løp"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">{dist(w.distanceKm)}</td>
                  <td className="px-4 py-3 text-right">{duration(w.durationSec)}</td>
                  <td className="px-4 py-3 text-right">{pace(w.avgPaceSecPerKm)}</td>
                  <td className="px-4 py-3 text-right">{w.avgHr ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
