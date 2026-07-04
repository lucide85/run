import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Me, PlannedSession, Settings, Workout } from "../api/client";
import { Button, PageTitle, Spinner, Ring, TypeBadge } from "../components/ui";
import { dateNo, dist, pace, SESSION_COLORS } from "../lib/format";
import { SyncButton } from "../components/SyncButton";
import { Companion } from "../components/Companion";

// Modul-nivå vakt så auto-synk bare fyres én gang per sidelast
// (React StrictMode dobbeltmonterer effekter i dev).
let autoSyncAttempted = false;

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
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load(): Promise<Settings | null> {
    try {
      setError(false);
      const [s, w, st, m] = await Promise.all([api.sessions(), api.workouts(), api.settings(), api.me()]);
      setSessions(s);
      setWorkouts(w);
      setSettings(st);
      setMe(m);
      return st;
    } catch (e) {
      console.warn("Kunne ikke laste oversikten:", e);
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const st = await load();
      // Auto-synk ved åpning: kun hvis Garmin er koblet til og siste synk
      // mangler eller er eldre enn 30 minutter. Stille feil – aldri blokkerende.
      if (!st || autoSyncAttempted || !st.garminConnected) return;
      const last = st.lastSync ? new Date(st.lastSync).getTime() : NaN;
      const fresh = Number.isFinite(last) && Date.now() - last < 30 * 60 * 1000;
      if (fresh) return;
      autoSyncAttempted = true;
      try {
        await api.sync();
        await load();
      } catch (e) {
        console.warn("Automatisk Garmin-synk feilet:", e);
      }
    })();
  }, []);

  if (loading) return <Spinner />;

  if (error || !settings) {
    return (
      <div>
        <PageTitle title="Oversikt" />
        <div className="card card-pad" style={{ maxWidth: 420 }}>
          <p className="muted" style={{ marginTop: 0 }}>Kunne ikke laste innhold.</p>
          <Button
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Prøv igjen
          </Button>
        </div>
      </div>
    );
  }

  const thisWeek = isoWeek(new Date());
  const upcoming = sessions
    .filter((s) => s.status === "planned" || s.status === "moved")
    .filter((s) => new Date(s.date) >= new Date(new Date().toDateString()))
    .slice(0, 4);

  const completed = sessions.filter((s) => s.status === "completed").length;
  const total = sessions.length;
  const last7 = workouts.filter((w) => new Date(w.startTime).getTime() > Date.now() - 7 * 86400000);
  const weeklyKm = last7.reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);

  const weekSessions = sessions.filter((s) => isoWeek(new Date(s.date)) === thisWeek);
  const weekDone = weekSessions.filter((s) => s.status === "completed").length;
  const weekTotal = weekSessions.length;

  // Forsinkede økter: planlagt/flyttet med dato før i dag (siste 14 dager)
  const todayStart = new Date(new Date().toDateString()).getTime();
  const overdue = sessions
    .filter((s) => s.status === "planned" || s.status === "moved")
    .filter((s) => {
      const day = new Date(new Date(s.date).toDateString()).getTime();
      return Number.isFinite(day) && day < todayStart && day >= todayStart - 14 * 86400000;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const next = upcoming[0];
  const raceDays = settings.race.date ? daysUntil(settings.race.date) : null;
  const phaseName = next?.phaseName ?? sessions.find((s) => s.status !== "completed")?.phaseName ?? "";

  return (
    <div>
      <PageTitle
        title="Oversikt"
        subtitle={`Uke ${thisWeek}${phaseName ? ` · ${phaseName}` : ""}`}
        action={<SyncButton onDone={load} />}
      />

      {/* Hero countdown */}
      <div
        className="card fadein"
        style={{ background: "var(--bg-rail)", border: "none", color: "#fff", overflow: "hidden", position: "relative", marginBottom: 18 }}
      >
        <div
          style={{
            position: "absolute",
            right: -40,
            top: -40,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,128,148,0.35), transparent 70%)",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 28, padding: "28px 30px", position: "relative" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 700, color: "var(--primary-300)", textTransform: "uppercase" }}>
              Ditt mål
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginTop: 6 }}>{settings.race.name}</div>
            {raceDays != null ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                <span className="tnum" style={{ fontSize: 58, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2 }}>
                  {raceDays}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>dager igjen</span>
              </div>
            ) : (
              <div style={{ marginTop: 14, color: "rgba(255,255,255,0.65)" }}>Sett løpsdato i Innstillinger</div>
            )}
            {settings.race.date && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>
                <i className="fa-regular fa-calendar" style={{ marginRight: 7 }} />
                {dateNo(settings.race.date)}
              </div>
            )}
          </div>

          <div style={{ display: "grid", placeItems: "center" }}>
            <Ring pct={total ? completed / total : 0} size={140} stroke={13} color="var(--primary-300)" track="rgba(255,255,255,0.12)">
              <div style={{ color: "#fff" }}>
                <div className="tnum" style={{ fontSize: 26, fontWeight: 800 }}>
                  {completed}
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>/{total}</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>økter fullført</div>
              </div>
            </Ring>
          </div>

          <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="flex items-center gap12" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px" }}>
              <i className="fa-solid fa-road" style={{ color: "var(--t-langtur)", fontSize: 18 }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{weeklyKm.toFixed(1)} km</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>siste 7 dager · {last7.length} økter</div>
              </div>
            </div>
            {next ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/plan/${next.id}`)}
                style={{ justifyContent: "space-between" }}
              >
                <span>
                  <i className="fa-solid fa-play" style={{ marginRight: 8 }} />
                  Neste økt: {next.title}
                </span>
                <i className="fa-solid fa-arrow-right" />
              </button>
            ) : (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Ingen planlagte økter framover.</div>
            )}
          </div>
        </div>
      </div>

      {/* Treningskompis */}
      <Companion sessions={sessions} workouts={workouts} userId={me?.id} />

      {/* Stat tiles */}
      <div className="grid g4 stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat fadein">
          <div className="ico" style={{ background: "var(--primary-50)", color: "var(--primary-500)" }}>
            <i className="fa-solid fa-bullseye" />
          </div>
          <div className="label">Ukens mål</div>
          {weekTotal === 0 ? (
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>Ingen økter denne uken 😌</div>
          ) : (
            <>
              <div className="val tnum">
                {weekDone}
                <small> / {weekTotal} økter</small>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--grey-200)", marginTop: 10, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (weekDone / weekTotal) * 100)}%`, height: "100%", background: "var(--primary-500)", borderRadius: 99 }} />
              </div>
            </>
          )}
        </div>
        <div className="stat fadein">
          <div className="ico" style={{ background: "var(--t-fullfort-bg)", color: "var(--t-fullfort)" }}>
            <i className="fa-solid fa-circle-check" />
          </div>
          <div className="label">Fullførte økter</div>
          <div className="val tnum">
            {completed}
            <small> / {total}</small>
          </div>
          <div className="foot">hele programmet</div>
        </div>
        <div className="stat fadein">
          <div className="ico" style={{ background: "var(--t-langtur-bg)", color: "var(--t-langtur)" }}>
            <i className="fa-solid fa-road" />
          </div>
          <div className="label">Siste 7 dager</div>
          <div className="val tnum">
            {weeklyKm.toFixed(1)}
            <small> km</small>
          </div>
          <div className="foot">{last7.length} økter</div>
        </div>
        <div className="stat fadein">
          <div className="ico" style={{ background: "var(--info-50)", color: "var(--info-500)" }}>
            <i className="fa-solid fa-arrows-rotate" />
          </div>
          <div className="label">Sist synket</div>
          <div className="val" style={{ fontSize: 20 }}>
            {settings.lastSync ? dateNo(settings.lastSync) : "aldri"}
          </div>
          <div className="foot">Garmin</div>
        </div>
      </div>

      {/* Forsinkede økter */}
      {overdue.length > 0 && (
        <div
          className="card fadein"
          style={{ marginBottom: 18, background: "var(--t-kvalitet-bg)", borderColor: "var(--t-kvalitet)" }}
        >
          <div className="card-head">
            <h3>
              <i className="fa-solid fa-triangle-exclamation" style={{ color: "var(--t-kvalitet)", marginRight: 8 }} />
              Forsinkede økter
            </h3>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdue.map((s) => (
              <Link
                key={s.id}
                to={`/plan/${s.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: 13.5,
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title}
                </span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>{dateNo(s.date)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Two columns */}
      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <h3>Kommende økter</h3>
            <Link to="/kalender" className="link">
              Kalender →
            </Link>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcoming.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Ingen planlagte økter framover.</p>
            ) : (
              upcoming.map((s) => (
                <div key={s.id} className="srow fadein" onClick={() => navigate(`/plan/${s.id}`)}>
                  <span className="accent" style={{ background: SESSION_COLORS[s.type] }} />
                  <div className="s-main">
                    <div className="flex items-center gap8" style={{ marginBottom: 4 }}>
                      <TypeBadge type={s.type} />
                      <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{dateNo(s.date)}</span>
                    </div>
                    <div className="s-title">{s.title}</div>
                  </div>
                  <div className="s-zone hide-m">{s.targetZone}</div>
                  <i className="fa-solid fa-chevron-right chev" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Siste økter</h3>
            <Link to="/okter" className="link">
              Se alle →
            </Link>
          </div>
          <div className="card-body" style={{ padding: "8px 12px" }}>
            {workouts.length === 0 ? (
              <p className="muted" style={{ margin: "10px", fontSize: 13.5 }}>
                Ingen importerte økter ennå. Trykk «Synk med Garmin».
              </p>
            ) : (
              workouts.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="flex items-center between"
                  style={{ padding: "11px 10px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", borderRadius: 8 }}
                  onClick={() => navigate(`/okter/${w.id}`)}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{w.name || w.sport || "Løp"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{dateNo(w.startTime)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 800 }}>{dist(w.distanceKm)}</div>
                    <div className="muted tnum" style={{ fontSize: 12 }}>
                      {pace(w.avgPaceSecPerKm)} · {w.avgHr ?? "–"} bpm
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
