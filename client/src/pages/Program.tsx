import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlannedSession, PlanProposal } from "../api/client";
import { PageTitle, Button, Spinner, TypeBadge, StatusBadge } from "../components/ui";
import { dateShort, dist, pace, SESSION_COLORS } from "../lib/format";

const PHASE_NAMES: Record<number, string> = {
  1: "Fase 1 — Grunnlag",
  2: "Fase 2 — Bygging",
  3: "Fase 3 — Spissing",
  4: "Fase 4 — Nedtrapping",
};

export default function Program() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [proposing, setProposing] = useState(false);

  async function load() {
    setSessions(await api.sessions());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function propose() {
    setProposing(true);
    setProposal(null);
    try {
      setProposal(await api.proposePlan());
    } catch (e) {
      alert(`Kunne ikke hente forslag: ${(e as Error).message}`);
    } finally {
      setProposing(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    await api.applyPlan(proposal);
    setProposal(null);
    await load();
  }

  if (loading) return <Spinner />;

  const byWeek = new Map<number, PlannedSession[]>();
  for (const s of sessions) {
    if (!byWeek.has(s.week)) byWeek.set(s.week, []);
    byWeek.get(s.week)!.push(s);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let lastPhase = 0;

  return (
    <div>
      <PageTitle
        title="Treningsprogram"
        subtitle="17 uker · 3 økter i uken · mot 10 km"
        action={
          <Button variant="ai" onClick={propose} disabled={proposing}>
            <i className={`fa-solid ${proposing ? "fa-arrows-rotate fa-spin" : "fa-wand-magic-sparkles"}`} />
            {proposing ? "Vurderer…" : "AI-tilpass plan"}
          </Button>
        }
      />

      {proposal && (
        <div className="card mb24" style={{ borderColor: "var(--primary-300)" }}>
          <div className="card-body">
            <h3 style={{ margin: 0, fontWeight: 700 }}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "var(--t-langtur)", marginRight: 8 }} />
              Forslag fra AI
            </h3>
            <p style={{ marginTop: 8 }}>{proposal.summary}</p>
            {proposal.changes.length === 0 ? (
              <p style={{ color: "var(--t-fullfort)", fontWeight: 600 }}>Ingen endringer foreslått – planen ser bra ut. 👍</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {proposal.changes.map((c, i) => (
                  <li key={i} style={{ background: "var(--grey-50)", borderRadius: 12, padding: 12, fontSize: 13.5 }}>
                    <div style={{ fontWeight: 700 }}>
                      Økt #{c.sessionId} · {c.field}
                    </div>
                    <div className="muted" style={{ textDecoration: "line-through" }}>{c.before}</div>
                    <div>→ {c.after}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.reason}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap8" style={{ marginTop: 16 }}>
              {proposal.changes.length > 0 && <Button onClick={apply}>Godta endringer</Button>}
              <Button variant="ghost" onClick={() => setProposal(null)}>
                Avvis
              </Button>
            </div>
          </div>
        </div>
      )}

      {weeks.map((week) => {
        const ws = byWeek.get(week)!.sort((a, b) => a.slot - b.slot);
        const phase = ws[0].phase;
        const showPhase = phase !== lastPhase;
        lastPhase = phase;
        return (
          <div key={week}>
            {showPhase && (
              <div className="sec-label" style={{ marginBottom: 14, marginTop: 8 }}>
                {PHASE_NAMES[phase] ?? ws[0].phaseName}
              </div>
            )}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">
                <h3>Uke {week}</h3>
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{dateShort(ws[0].date)}</span>
              </div>
              <div className="card-body">
                <div className="grid g3 prog-grid">
                  {ws.map((s) => {
                    const done = s.status === "completed";
                    return (
                      <div
                        key={s.id}
                        className="psess"
                        onClick={() => navigate(`/plan/${s.id}`)}
                        style={{ borderTop: `3px solid ${done ? "var(--t-fullfort)" : SESSION_COLORS[s.type]}` }}
                      >
                        <div className="flex between items-center" style={{ marginBottom: 10 }}>
                          <TypeBadge type={s.type} />
                          <StatusBadge status={s.status} />
                        </div>
                        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>{s.title}</div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 3, minHeight: 34 }}>{s.description}</div>
                        <div
                          className="flex between items-center"
                          style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}
                        >
                          <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{dateShort(s.date)}</span>
                          {s.plannedDistanceKm != null && (
                            <span className="tnum" style={{ fontSize: 14, fontWeight: 800 }}>{dist(s.plannedDistanceKm)}</span>
                          )}
                        </div>
                        {s.targetPaceMinSec && (
                          <div className="muted tnum" style={{ fontSize: 12, marginTop: 6 }}>
                            <i className="fa-solid fa-gauge-simple-high" style={{ color: SESSION_COLORS[s.type], marginRight: 6 }} />
                            {pace(s.targetPaceMinSec)}–{pace(s.targetPaceMaxSec)} /km
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
