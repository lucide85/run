import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, RecordEntry } from "../api/client";
import { Button, Card, PageTitle, Spinner } from "../components/ui";
import { dateNo, pace, timeHms } from "../lib/format";

// De tre gjeveste rekordene får gull-preg
const TOP_KEYS = new Set(["fastest1k", "fastest5k", "fastest10k"]);

const RECORD_ICONS: Record<string, string> = {
  fastest1k: "🥇",
  fastest5k: "🥇",
  fastest10k: "🥇",
  fastestRun: "⚡",
  longestRun: "🛣️",
  longestDuration: "⏱️",
  biggestWeek: "📅",
  mostElevation: "⛰️",
};

export function formatRecordValue(r: RecordEntry): string {
  switch (r.unit) {
    case "sec":
      return timeHms(r.value);
    case "km":
      return `${(Math.round(r.value * 10) / 10).toFixed(1).replace(".", ",")} km`;
    case "m":
      return `${Math.round(r.value)} m`;
    case "secPerKm":
      return `${pace(r.value)}/km`;
    default:
      return String(r.value);
  }
}

type SeenMap = Record<string, string>;

function readSeen(key: string): SeenMap | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : null;
  } catch {
    return null;
  }
}

function writeSeen(key: string, map: SeenMap): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* privat modus e.l. – rekordene vises uansett */
  }
}

export default function RecordsPage() {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [newRecords, setNewRecords] = useState<RecordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const [r, me] = await Promise.all([
        api.records(),
        api.me().catch(() => null),
      ]);
      setRecords(r.records);

      // Ny rekord-feiring: sammenlign mot lagret «holder» per rekord
      if (me) {
        const storageKey = `records.seen.${me.id}`;
        const seen = readSeen(storageKey);
        const current: SeenMap = {};
        for (const rec of r.records) current[rec.key] = `${rec.workoutId ?? "-"}:${rec.value}`;
        if (seen && Object.keys(seen).length > 0) {
          const fresh = r.records.filter((rec) => seen[rec.key] !== undefined && seen[rec.key] !== current[rec.key]);
          // Rekorder som er helt nye (nøkkel fantes ikke fra før) regnes også som nye
          const brandNew = r.records.filter((rec) => seen[rec.key] === undefined);
          setNewRecords([...fresh, ...brandNew]);
        } else {
          setNewRecords([]);
        }
        writeSeen(storageKey, current);
      }
    } catch (e) {
      console.warn("Kunne ikke laste rekordene:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div>
        <PageTitle title="Rekorder" subtitle="Dine personlige bestenoteringer" />
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
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Rekorder" subtitle="Dine personlige bestenoteringer" />

      {newRecords.length > 0 && (
        <div
          className="card card-pad fadein"
          style={{
            marginBottom: 18,
            background: "linear-gradient(135deg, #FFF8E1, #FFFDF5)",
            border: "1px solid #E5C558",
          }}
        >
          {newRecords.map((r) => (
            <div key={r.key} style={{ fontSize: 15, fontWeight: 700, padding: "2px 0" }}>
              🏆 Ny rekord: {r.label} – {formatRecordValue(r)}!
            </div>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <Card>
          <p className="muted" style={{ margin: 0, textAlign: "center", padding: "30px 10px", fontSize: 14 }}>
            Ingen rekorder ennå – de dukker opp etter hvert som du løper! 🏃
          </p>
        </Card>
      ) : (
        <div className="grid g4 stats-grid">
          {records.map((r) => {
            const top = TOP_KEYS.has(r.key);
            const inner = (
              <div
                className="stat fadein"
                style={
                  top
                    ? {
                        background: "linear-gradient(160deg, #FFF8E1, #FFFFFF 70%)",
                        border: "1px solid #E5C558",
                        height: "100%",
                      }
                    : { height: "100%" }
                }
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{RECORD_ICONS[r.key] ?? "🏅"}</div>
                <div className="label">{r.label}</div>
                <div className="val tnum" style={top ? { color: "#9A7B14" } : undefined}>
                  {formatRecordValue(r)}
                </div>
                <div className="foot">
                  {dateNo(r.date)}
                  {r.extra ? ` · ${r.extra}` : ""}
                </div>
              </div>
            );
            return r.workoutId != null ? (
              <Link key={r.key} to={`/okter/${r.workoutId}`} style={{ textDecoration: "none", color: "inherit" }}>
                {inner}
              </Link>
            ) : (
              <div key={r.key}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
