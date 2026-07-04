import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Workout } from "../api/client";
import { Button, Card, PageTitle, Spinner } from "../components/ui";
import { SyncButton } from "../components/SyncButton";
import { dateNo, dist, duration, pace } from "../lib/format";

export default function Workouts() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setWorkouts(await api.workouts());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

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

  return (
    <div>
      <PageTitle title="Økter" subtitle={`${workouts.length} importerte økter fra Garmin`} action={<SyncButton onDone={load} />} />

      {workouts.length === 0 ? (
        <div className="card card-pad">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Ingen økter ennå. Trykk «Synk med Garmin» for å importere fra Garmin Connect.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop-tabell */}
          <div className="card hide-m" style={{ overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Økt</th>
                  <th className="r">Distanse</th>
                  <th className="r">Tid</th>
                  <th className="r">Tempo</th>
                  <th className="r">Puls</th>
                </tr>
              </thead>
              <tbody>
                {workouts.map((w) => (
                  <tr
                    key={w.id}
                    style={{ cursor: "pointer" }}
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/okter/${w.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/okter/${w.id}`)}
                  >
                    <td style={{ whiteSpace: "nowrap", color: "var(--fg-secondary)", fontWeight: 600 }}>{dateNo(w.startTime)}</td>
                    <td>
                      <a>{w.name || w.sport || "Løp"}</a>
                    </td>
                    <td className="r tnum" style={{ fontWeight: 700 }}>{dist(w.distanceKm)}</td>
                    <td className="r tnum">{duration(w.durationSec)}</td>
                    <td className="r tnum">{pace(w.avgPaceSecPerKm)}</td>
                    <td className="r tnum">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <i className="fa-solid fa-heart" style={{ color: "var(--t-lop)", fontSize: 11 }} />
                        {w.avgHr ?? "–"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil-kort */}
          <div className="show-m" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workouts.map((w) => (
              <div
                key={w.id}
                className="card"
                style={{ padding: "14px 16px", cursor: "pointer" }}
                tabIndex={0}
                role="link"
                onClick={() => navigate(`/okter/${w.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/okter/${w.id}`)}
              >
                <div className="flex between items-center">
                  <div>
                    <a style={{ fontSize: 15, fontWeight: 700 }}>{w.name || w.sport || "Løp"}</a>
                    <div className="muted" style={{ fontSize: 12 }}>{dateNo(w.startTime)}</div>
                  </div>
                  <div className="tnum" style={{ fontSize: 17, fontWeight: 800 }}>{dist(w.distanceKm)}</div>
                </div>
                <div className="flex gap16 tnum" style={{ marginTop: 10, fontSize: 13, color: "var(--fg-secondary)" }}>
                  <span>
                    <i className="fa-regular fa-clock" style={{ marginRight: 5 }} />
                    {duration(w.durationSec)}
                  </span>
                  <span>
                    <i className="fa-solid fa-gauge-simple-high" style={{ marginRight: 5 }} />
                    {pace(w.avgPaceSecPerKm)}
                  </span>
                  <span>
                    <i className="fa-solid fa-heart" style={{ color: "var(--t-lop)", marginRight: 5 }} />
                    {w.avgHr ?? "–"} bpm
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
