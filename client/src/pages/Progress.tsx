import { useEffect, useState, ReactNode } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend,
  ReferenceLine,
} from "recharts";
import { api, Workout, WeightLog, FitnessData } from "../api/client";
import { PageTitle, Spinner, Button, Card } from "../components/ui";
import { pace, dateShort, isoWeek, isoWeekYear, timeHms } from "../lib/format";

const C_PACE = "#2C4894"; // secondary
const C_VOL = "#7A52CC"; // langtur
const C_HR = "#D7263D"; // løp
const C_WEIGHT = "#008094"; // primary
const C_CTL = "#008094"; // form (teal)
const C_ATL = "#E59B2E"; // slitasje (oransje)
const C_TSB = "#8A8A90"; // overskudd (grå)

/** Dagens dato som «YYYY-MM-DD» i lokal tid (toISOString gir gårsdagen før kl. 01/02). */
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [fitness, setFitness] = useState<FitnessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wDate, setWDate] = useState(localDateStr());
  const [wVal, setWVal] = useState("");
  const [wError, setWError] = useState("");
  const [wSaved, setWSaved] = useState(false);

  async function load() {
    setError(null);
    try {
      // Formkurven er ny funksjonalitet – siden skal rendre selv om den feiler
      const [w, wl, fit] = await Promise.all([api.workouts(), api.weight(), api.fitness().catch(() => null)]);
      setWorkouts([...w].reverse());
      setWeights(wl);
      setFitness(fit);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function addWeight() {
    const v = parseFloat(wVal.replace(",", "."));
    if (!v) return;
    setWError("");
    setWSaved(false);
    try {
      await api.addWeight(new Date(wDate).toISOString(), v);
      setWVal("");
      setWSaved(true);
      setTimeout(() => setWSaved(false), 2500);
      await load();
    } catch (e) {
      setWError((e as Error).message);
    }
  }

  if (loading) return <Spinner />;
  if (error)
    return (
      <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>Kunne ikke laste innhold.</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            load();
          }}
        >
          <i className="fa-solid fa-arrows-rotate" />
          Prøv igjen
        </Button>
      </Card>
    );

  const paceData = workouts
    .filter((w) => w.avgPaceSecPerKm)
    .map((w) => ({ date: dateShort(w.startTime), pace: w.avgPaceSecPerKm, km: w.distanceKm }));

  // Ukevolum nøklet på ISO-år + ISO-uke, slik at «uke 2» i fjor og i år ikke slås sammen
  const volumeMap = new Map<string, { week: string; km: number }>();
  for (const w of workouts) {
    const d = new Date(w.startTime);
    const k = `${isoWeekYear(d)}-W${isoWeek(d)}`;
    const cur = volumeMap.get(k);
    if (cur) cur.km += w.distanceKm ?? 0;
    else volumeMap.set(k, { week: `U${isoWeek(d)}`, km: w.distanceKm ?? 0 });
  }
  const volumeData = [...volumeMap.values()]
    .map(({ week, km }) => ({ week, km: Math.round(km * 10) / 10 }))
    .slice(-26); // maks de siste 26 ukene

  // Intervalløkter holdes utenfor – snittpuls/-tempo for en intervalløkt sier lite om formen
  const effSource = workouts.filter(
    (w) => w.avgHr && w.avgPaceSecPerKm && (w.sport ?? "").toLowerCase().includes("run")
  );
  const effExcluded = effSource.some((w) => w.plannedSession?.type === "quality");
  const effData = effSource
    .filter((w) => w.plannedSession?.type !== "quality")
    .map((w) => ({ date: dateShort(w.startTime), hr: w.avgHr, pace: w.avgPaceSecPerKm }));

  const weightData = weights.map((w) => ({ date: dateShort(w.date), kg: w.weightKg }));

  // Formkurve: siste 120 dager med form (CTL), slitasje (ATL) og overskudd (TSB)
  const fitnessDays = (fitness?.days ?? []).slice(-120);
  const fitnessData = fitnessDays.map((d) => ({
    date: dateShort(d.date),
    ctl: Math.round(d.ctl * 10) / 10,
    atl: Math.round(d.atl * 10) / 10,
    tsb: Math.round(d.tsb * 10) / 10,
  }));
  // Vis omtrent månedlige merker på x-aksen
  const fitnessTickInterval = Math.max(0, Math.ceil(fitnessData.length / 5) - 1);

  const pred = fitness?.prediction ?? null;
  const predCurrent = pred?.current ?? null;
  const predHistory = pred?.history ?? [];
  const predTrend = predHistory.map((p) => ({ date: dateShort(p.date), sec: p.predictedSec }));

  // Endring siste måned: sammenlign med det eldste prognosepunktet nyere enn 35 dager
  let predDelta: number | null = null;
  if (predCurrent && predHistory.length > 0) {
    const cutoff = new Date(predCurrent.date).getTime() - 35 * 86400000;
    const monthAgo = predHistory.find(
      (p) => new Date(p.date).getTime() >= cutoff && new Date(p.date).getTime() < new Date(predCurrent.date).getTime()
    );
    if (monthAgo) predDelta = monthAgo.predictedSec - predCurrent.predictedSec;
  }

  return (
    <div>
      <PageTitle title="Progresjon" subtitle="Utvikling over tid — slik bygger formen seg" />

      {fitness && (
        <div className="grid g2" style={{ marginBottom: 18 }}>
          <ChartCard title="Løpsprognose 10 km">
            {predCurrent ? (
              <div>
                <div className="flex items-center gap12 wrap">
                  <span className="tnum" style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>
                    {timeHms(predCurrent.predictedSec)}
                  </span>
                  {predDelta != null && Math.abs(predDelta) >= 1 && (
                    <span
                      className="chip"
                      style={{
                        border: "1px solid var(--border-subtle)",
                        color: predDelta > 0 ? "var(--t-fullfort)" : "var(--error-500)",
                        fontWeight: 700,
                      }}
                    >
                      {predDelta > 0 ? "▼" : "▲"} {timeHms(Math.abs(predDelta))} siste måned
                    </span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  basert på beste {predCurrent.basedOn === "1k" ? "1 km" : "5 km"}-innsats siste 6 uker
                  {predCurrent.basedOn === "1k" && " (usikker – løp en lengre hard økt for bedre anslag)"}
                </div>
                {predTrend.length >= 2 && (
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={predTrend} margin={{ left: 5, right: 10, top: 14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#CACACE" />
                      <YAxis
                        reversed
                        tickFormatter={(v) => timeHms(v)}
                        tick={{ fontSize: 11 }}
                        stroke="#CACACE"
                        width={54}
                        domain={["dataMin - 30", "dataMax + 30"]}
                      />
                      <Tooltip formatter={(v) => [timeHms(v as number), "Prognose"]} />
                      <Line type="monotone" dataKey="sec" stroke={C_WEIGHT} strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <Empty text="Ingen prognose ennå – fullfør noen løpeturer først." />
            )}
          </ChartCard>

          <ChartCard
            title="Formkurve"
            foot={
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Form bygges sakte (42 dager), slitasje kommer raskt (7 dager). Positivt overskudd = uthvilt.
              </div>
            }
          >
            {fitnessData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={fitnessData} margin={{ left: -5, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#CACACE" interval={fitnessTickInterval} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#CACACE" />
                  <ReferenceLine y={0} stroke="#CACACE" strokeDasharray="4 4" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="ctl" name="Form" stroke={C_CTL} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="atl" name="Slitasje" stroke={C_ATL} strokeWidth={1.5} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="tsb"
                    name="Overskudd"
                    stroke={C_TSB}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

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

        <ChartCard
          title="Puls vs. tempo (løp)"
          sub="Bedre form = lavere puls ved samme tempo over tid."
          foot={
            effExcluded ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Intervalløkter er holdt utenfor.
              </div>
            ) : undefined
          }
        >
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
              {wSaved && (
                <span style={{ color: "var(--t-fullfort)", fontSize: 13, fontWeight: 600 }}>Lagret ✓</span>
              )}
            </div>
            {wError && (
              <p style={{ color: "var(--error-500)", fontSize: 13, marginTop: 0, marginBottom: 12 }}>
                Kunne ikke lagre vekten: {wError}
              </p>
            )}
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
