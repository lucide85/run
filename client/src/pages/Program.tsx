import { useEffect, useState } from "react";
import { api, PlannedSession, PlanProposal } from "../api/client";
import { Card, PageTitle, TypeBadge, StatusBadge, Button, Spinner } from "../components/ui";
import { dateShort, dist, pace } from "../lib/format";

const PHASE_NAMES: Record<number, string> = {
  1: "Fase 1 – Grunnlag",
  2: "Fase 2 – Bygging",
  3: "Fase 3 – Spissing",
  4: "Fase 4 – Nedtrapping",
};

export default function Program() {
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
        subtitle="17 uker · 3 økter i uken"
        action={
          <Button variant="soft" onClick={propose} disabled={proposing}>
            {proposing ? "Vurderer…" : "✨ AI-tilpass plan"}
          </Button>
        }
      />

      {proposal && (
        <Card className="mb-6 border-brand-200 bg-brand-50/40">
          <h3 className="font-semibold text-slate-700">Forslag fra AI</h3>
          <p className="mt-1 text-sm text-slate-600">{proposal.summary}</p>
          {proposal.changes.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-600">Ingen endringer foreslått – planen ser bra ut. 👍</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {proposal.changes.map((c, i) => (
                <li key={i} className="rounded-xl bg-white p-3 text-sm">
                  <div className="font-medium text-slate-700">Økt #{c.sessionId} · {c.field}</div>
                  <div className="mt-1 text-slate-400 line-through">{c.before}</div>
                  <div className="text-slate-700">→ {c.after}</div>
                  <div className="mt-1 text-xs text-slate-400">{c.reason}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            {proposal.changes.length > 0 && <Button onClick={apply}>Godta endringer</Button>}
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Avvis
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-8">
        {weeks.map((week) => {
          const ws = byWeek.get(week)!.sort((a, b) => a.slot - b.slot);
          const phase = ws[0].phase;
          const showPhase = phase !== lastPhase;
          lastPhase = phase;
          return (
            <div key={week}>
              {showPhase && (
                <h2 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wide text-brand-600">
                  {PHASE_NAMES[phase]}
                </h2>
              )}
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Uke {week}</span>
                  <span className="text-xs text-slate-400">{dateShort(ws[0].date)}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ws.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded-xl border p-3 ${
                        s.aiAdjusted ? "border-brand-200 bg-brand-50/30" : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <TypeBadge type={s.type} />
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-700">{s.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{s.description}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>{dateShort(s.date)}</span>
                        {s.plannedDistanceKm && <span>{dist(s.plannedDistanceKm)}</span>}
                      </div>
                      {s.targetPaceMinSec && (
                        <div className="mt-1 text-xs text-slate-400">
                          🎯 {pace(s.targetPaceMinSec)}–{pace(s.targetPaceMaxSec)} /km
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
