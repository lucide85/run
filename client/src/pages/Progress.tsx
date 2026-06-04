import { useEffect, useState, ReactNode } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import { api, Workout, WeightLog } from "../api/client";
import { PageTitle, Spinner, Button } from "../components/ui";
import { pace, dateShort } from "../lib/format";

const C_PACE = "#2C4894"; // secondary
const C_VOL = "#7A52CC"; // langtur
const C_HR = "#D7263D"; // løp
const C_WEIGHT = "#008094"; // primary

function weekKey(iso: string): string {
  const d = new Date(iso);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `U${week}`;
}

function ChartCard({ title, sub, children, foot }: { title: string; sub?: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
      </div>
      <div className="card-body">
        {sub && <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{sub}</div>}
        {children}
        {foot}
      </div>
    </div>
  );
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
      <PageTitle title="Progresjon" subtitle="Utvikling over tid — slik bygger formen seg" />

      <div className="grid g2">
        <ChartCard title="Tempoutvikling" sub="Lavere er raskere. Trenden går rett vei.">
          {paceData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={paceData} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#CACACE" />
                <YAxis reversed tickFormatter={(v) => pace(v)} tick={{ fontSize: 11 }} stroke="#CACACE" domain={["dataMin - 20", "dataMax + 20"]} />
                <Tooltip formatter={(v) => [`${pace(v as number)} /km`, "Tempo"]} />
                <Line type="monotone" dataKey="pace" stroke={C_PACE} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Ukentlig volum (km)" sub="Hvor mye du løper hver uke.">
          {volumeData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#CACACE" />
                <YAxis tick={{ fontSize: 11 }} stroke="#CACACE" />
                <Tooltip formatter={(v) => [`${v} km`, "Volum"]} />
                <Bar dataKey="km" fill={C_VOL} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Puls vs. tempo (løp)" sub="Bedre form = lavere puls ved samme tempo over tid.">
          {effData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={effData} margin={{ left: -5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#CACACE" />
                <YAxis yAxisId="hr" tick={{ fontSize: 11 }} stroke={C_HR} domain={["dataMin - 5", "dataMax + 5"]} />
                <YAxis yAxisId="pace" orientation="right" reversed tickFormatter={(v) => pace(v)} tick={{ fontSize: 11 }} stroke={C_PACE} />
                <Tooltip formatter={(v, n) => (n === "pace" ? [`${pace(v as number)} /km`, "Tempo"] : [`${v} bpm`, "Puls"])} />
                <Legend />
                <Line yAxisId="hr" type="monotone" dataKey="hr" name="Puls" stroke={C_HR} strokeWidth={2.5} dot={{ r: 2 }} />
                <Line yAxisId="pace" type="monotone" dataKey="pace" name="pace" stroke={C_PACE} strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div className="card">
          <div className="card-head">
            <h3>Vekt (kg)</h3>
          </div>
          <div className="card-body">
            <div className="flex gap8 wrap items-center" style={{ marginBottom: 14 }}>
              <input className="input" type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} style={{ flex: "1 1 150px" }} />
              <input className="input" value={wVal} onChange={(e) => setWVal(e.target.value)} placeholder="kg" inputMode="decimal" style={{ flex: "0 0 90px" }} />
              <Button onClick={addWeight}>Logg</Button>
            </div>
            {weightData.length === 0 ? (
              <Empty text="Logg vekten din for å se utviklingen." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weightData} margin={{ left: -5, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#CACACE" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#CACACE" domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip formatter={(v) => [`${v} kg`, "Vekt"]} />
                  <Line type="monotone" dataKey="kg" stroke={C_WEIGHT} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ text = "Ingen data ennå." }: { text?: string }) {
  return (
    <div className="muted" style={{ textAlign: "center", padding: "44px 10px", fontSize: 13.5 }}>
      <i className="fa-solid fa-chart-line" style={{ fontSize: 24, opacity: 0.35, display: "block", marginBottom: 10 }} />
      {text}
    </div>
  );
}
