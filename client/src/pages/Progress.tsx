import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { api, Workout, WeightLog } from "../api/client";
import { Card, PageTitle, Spinner, Button } from "../components/ui";
import { pace, dateShort } from "../lib/format";

function weekKey(iso: string): string {
  const d = new Date(iso);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `U${week}`;
}

export default function Progress() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [wDate, setWDate] = useState(new Date().toISOString().slice(0, 10));
  const [wVal, setWVal] = useState("");

  async function load() {
    const [w, wl] = await Promise.all([api.workouts(), api.weight()]);
    setWorkouts([...w].reverse());
    setWeights(wl);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function addWeight() {
    const v = parseFloat(wVal.replace(",", "."));
    if (!v) return;
    await api.addWeight(new Date(wDate).toISOString(), v);
    setWVal("");
    await load();
  }

  if (loading) return <Spinner />;

  const paceData = workouts
    .filter((w) => w.avgPaceSecPerKm)
    .map((w) => ({ date: dateShort(w.startTime), pace: w.avgPaceSecPerKm, km: w.distanceKm }));

  const volumeMap = new Map<string, number>();
  for (const w of workouts) {
    const k = weekKey(w.startTime);
    volumeMap.set(k, (volumeMap.get(k) ?? 0) + (w.distanceKm ?? 0));
  }
  const volumeData = [...volumeMap.entries()].map(([week, km]) => ({ week, km: Math.round(km * 10) / 10 }));

  const effData = workouts
    .filter((w) => w.avgHr && w.avgPaceSecPerKm && (w.sport ?? "").toLowerCase().includes("run"))
    .map((w) => ({ date: dateShort(w.startTime), hr: w.avgHr, pace: w.avgPaceSecPerKm }));

  const weightData = weights.map((w) => ({ date: dateShort(w.date), kg: w.weightKg }));

  return (
    <div>
      <PageTitle title="Progresjon" subtitle="Utvikling over tid" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-700">Tempoutvikling</h3>
          {paceData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={paceData} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis reversed tickFormatter={(v) => pace(v)} tick={{ fontSize: 11 }} stroke="#cbd5e1" domain={["dataMin - 20", "dataMax + 20"]} />
                <Tooltip formatter={(v) => [`${pace(v as number)} /km`, "Tempo"]} />
                <Line type="monotone" dataKey="pace" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-slate-700">Ukentlig volum (km)</h3>
          {volumeData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <Tooltip formatter={(v) => [`${v} km`, "Volum"]} />
                <Bar dataKey="km" fill="#a78bfa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-slate-700">Puls vs. tempo (løp)</h3>
          <p className="mb-2 text-xs text-slate-400">Bedre form = lavere puls ved samme tempo over tid.</p>
          {effData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={effData} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis yAxisId="hr" tick={{ fontSize: 11 }} stroke="#f43f5e" domain={["dataMin - 5", "dataMax + 5"]} />
                <YAxis yAxisId="pace" orientation="right" reversed tickFormatter={(v) => pace(v)} tick={{ fontSize: 11 }} stroke="#3b82f6" />
                <Tooltip formatter={(v, n) => (n === "pace" ? [`${pace(v as number)} /km`, "Tempo"] : [`${v} bpm`, "Puls"])} />
                <Legend />
                <Line yAxisId="hr" type="monotone" dataKey="hr" name="Puls" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
                <Line yAxisId="pace" type="monotone" dataKey="pace" name="pace" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Vekt (kg)</h3>
          </div>
          <div className="mb-4 flex gap-2">
            <input
              type="date"
              value={wDate}
              onChange={(e) => setWDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={wVal}
              onChange={(e) => setWVal(e.target.value)}
              placeholder="kg"
              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <Button variant="soft" onClick={addWeight}>
              Logg
            </Button>
          </div>
          {weightData.length === 0 ? (
            <Empty text="Logg vekten din for å se utviklingen." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightData} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip formatter={(v) => [`${v} kg`, "Vekt"]} />
                <Line type="monotone" dataKey="kg" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty({ text = "Ingen data ennå." }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-slate-300">{text}</div>;
}
