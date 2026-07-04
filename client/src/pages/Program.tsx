import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlannedSession, PlanProposal, RegenProposal, Settings } from "../api/client";
import { PageTitle, Button, Card, Spinner, TypeBadge, StatusBadge } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { dateShort, dist, pace, SESSION_COLORS, SESSION_LABELS } from "../lib/format";

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
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Regenerering av program
  const [regenOpen, setRegenOpen] = useState(false);
  const [rName, setRName] = useState("");
  const [rDate, setRDate] = useState("");
  const [rDist, setRDist] = useState(10);
  const [rInstr, setRInstr] = useState("");
  const [regen, setRegen] = useState<RegenProposal | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenDetails, setRegenDetails] = useState(false);
  const [applyingRegen, setApplyingRegen] = useState(false);

  async function load() {
    setError(null);
    try {
      const [s, st] = await Promise.all([api.sessions(), api.settings().catch(() => null)]);
      setSessions(s);
      if (st) setSettings(st);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
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
    if (!proposal || applying) return;
    setApplying(true);
    try {
      await api.applyPlan(proposal);
      setProposal(null);
      await load();
    } catch (e) {
      alert(`Kunne ikke bruke endringene: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  function openRegen() {
    // Prefyll fra dagens mål/plan
    setRName(settings?.race.name ?? "");
    setRDate((settings?.race.date ?? "").slice(0, 10));
    const raceSession = sessions.find((s) => s.type === "race");
    setRDist(raceSession?.plannedDistanceKm ?? 10);
    setRInstr("");
    setRegen(null);
    setRegenDetails(false);
    setProposal(null);
    setRegenOpen(true);
  }

  async function regeneratePropose() {
    if (!rName || !rDate || !(rDist > 0)) {
      alert("Fyll inn navn, dato og distanse for målet.");
      return;
    }
    setRegenLoading(true);
    setRegen(null);
    try {
      setRegen(
        await api.regeneratePropose({ raceName: rName, raceDate: rDate, raceDistanceKm: rDist, instructions: rInstr })
      );
    } catch (e) {
      alert(`Kunne ikke lage forslag: ${(e as Error).message}`);
    } finally {
      setRegenLoading(false);
    }
  }

  async function regenerateApply() {
    if (!regen) return;
    if (!confirm("Bytte ut resten av programmet fra i dag til løpsdato? Fullførte økter beholdes.")) return;
    setApplyingRegen(true);
    try {
      await api.regenerateApply(regen);
      setRegenOpen(false);
      setRegen(null);
      await load();
    } catch (e) {
      alert(`Kunne ikke bytte ut programmet: ${(e as Error).message}`);
    } finally {
      setApplyingRegen(false);
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

  const byWeek = new Map<number, PlannedSession[]>();
  for (const s of sessions) {
    if (!byWeek.has(s.week)) byWeek.set(s.week, []);
    byWeek.get(s.week)!.push(s);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let lastPhase = 0;

  // Dynamisk undertittel – utledes fra brukerens egen plan (ikke hardkodet lengde).
  const perWeekCounts = weeks.map((w) => byWeek.get(w)!.filter((s) => s.type !== "race").length).filter((n) => n > 0);
  const perWeek = perWeekCounts.length
    ? perWeekCounts.sort(
        (a, b) =>
          perWeekCounts.filter((v) => v === b).length - perWeekCounts.filter((v) => v === a).length
      )[0]
    : 0;
  const raceKm = sessions.find((s) => s.type === "race")?.plannedDistanceKm ?? null;
  const subtitle = [
    weeks.length ? `${weeks.length} ${weeks.length === 1 ? "uke" : "uker"}` : null,
    perWeek ? `${perWeek} ${perWeek === 1 ? "økt" : "økter"} i uken` : null,
    raceKm ? `mot ${raceKm % 1 === 0 ? raceKm : raceKm.toFixed(1)} km` : "din personlige plan",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageTitle
        title="Treningsprogram"
        subtitle={subtitle}
        action={
          <div className="flex gap8 wrap">
            <Button variant="ai" onClick={propose} disabled={proposing}>
              <i className={`fa-solid ${proposing ? "fa-arrows-rotate fa-spin" : "fa-wand-magic-sparkles"}`} />
              {proposing ? "Vurderer…" : "AI-tilpass plan"}
            </Button>
            <Button variant="secondary" onClick={openRegen}>
              <i className="fa-solid fa-rotate" />
              Regenerer program
            </Button>
          </div>
        }
      />

      {regenOpen && (
        <div className="card mb24" style={{ borderColor: "var(--t-langtur)" }}>
          <div className="card-head">
            <h3 style={{ margin: 0, fontWeight: 700 }}>
              <i className="fa-solid fa-rotate" style={{ color: "var(--t-langtur)", marginRight: 8 }} />
              Regenerer programmet
            </h3>
            <button
              className="link muted"
              style={{ fontSize: 13, background: "none", border: "none", padding: 0, fontFamily: "inherit" }}
              onClick={() => setRegenOpen(false)}
            >
              Lukk
            </button>
          </div>
          <div className="card-body">
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
              Juster målet og beskriv hva du ønsker endret. AI lager et forslag for resten av perioden – fullførte økter beholdes.
            </p>

            <div className="grid g3" style={{ gap: 12 }}>
              <div className="field">
                <label>Navn på målet</label>
                <input className="input" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="F.eks. Sentrumsløpet" />
              </div>
              <div className="field">
                <label>Dato</label>
                <input className="input" type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Distanse (km)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={0.5}
                  value={rDist}
                  onChange={(e) => setRDist(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Ønskede endringer</label>
              <textarea
                className="input"
                rows={3}
                value={rInstr}
                onChange={(e) => setRInstr(e.target.value)}
                placeholder="F.eks. «Jeg vil ha flere intervalløkter», «mindre volum, jeg sliter med leggen», «legg inn en testkonkurranse om tre uker»…"
              />
            </div>

            <div className="flex gap8" style={{ marginTop: 14 }}>
              <Button variant="ai" onClick={regeneratePropose} disabled={regenLoading}>
                <i className={`fa-solid ${regenLoading ? "fa-arrows-rotate fa-spin" : "fa-wand-magic-sparkles"}`} />
                {regenLoading ? "Lager forslag…" : "Lag forslag"}
              </Button>
            </div>

            {regen && (
              <div style={{ marginTop: 20, borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
                <div className="sec-label" style={{ marginBottom: 8 }}>
                  Forslag · {regen.weeksUntil} {regen.weeksUntil === 1 ? "uke" : "uker"} fram til{" "}
                  {regen.raceName} ({regen.raceDistanceKm % 1 === 0 ? regen.raceDistanceKm : regen.raceDistanceKm.toFixed(1)} km)
                </div>
                <Markdown>{regen.summary}</Markdown>

                <button
                  className="link"
                  style={{
                    fontSize: 13,
                    display: "inline-block",
                    marginTop: 8,
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontFamily: "inherit",
                  }}
                  onClick={() => setRegenDetails((v) => !v)}
                >
                  <i className={`fa-solid ${regenDetails ? "fa-chevron-up" : "fa-chevron-down"}`} style={{ marginRight: 6 }} />
                  {regenDetails ? "Skjul detaljer" : "Vis detaljer (uke for uke)"}
                </button>

                {regenDetails && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    {regen.weeks.map((w) => (
                      <div key={w.week} style={{ background: "var(--grey-50)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
                          Uke {w.week} · {w.phaseName}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {w.sessions.map((ss, i) => (
                            <div key={i} style={{ fontSize: 13 }}>
                              <span style={{ fontWeight: 700 }}>{SESSION_LABELS[ss.type] ?? ss.type}:</span> {ss.title}
                              {ss.distanceKm ? ` · ${ss.distanceKm} km` : ""}
                              {ss.targetZone ? ` · ${ss.targetZone}` : ""}
                              <div className="muted" style={{ fontSize: 12 }}>{ss.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap8" style={{ marginTop: 16 }}>
                  <Button onClick={regenerateApply} disabled={applyingRegen}>
                    <i className={`fa-solid ${applyingRegen ? "fa-arrows-rotate fa-spin" : "fa-check"}`} />
                    {applyingRegen ? "Bytter ut…" : "Godta og bytt ut programmet"}
                  </Button>
                  <Button variant="ghost" onClick={() => setRegen(null)}>
                    Forkast forslag
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {proposal && (
        <div className="card mb24" style={{ borderColor: "var(--primary-300)" }}>
          <div className="card-body">
            <h3 style={{ margin: 0, fontWeight: 700 }}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "var(--t-langtur)", marginRight: 8 }} />
              AI-vurdering av planen
            </h3>

            <div style={{ marginTop: 10 }}>
              <Markdown>{proposal.evaluation}</Markdown>
            </div>

            {proposal.changes.length === 0 ? (
              <p style={{ color: "var(--t-fullfort)", fontWeight: 600, marginTop: 12 }}>
                Ingen endringer foreslått – planen ser bra ut. 👍
              </p>
            ) : (
              <>
                <div className="sec-label" style={{ margin: "18px 0 10px" }}>
                  Foreslåtte endringer ({proposal.changes.length})
                </div>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {proposal.changes.map((c, i) => {
                    const sess = sessions.find((s) => s.id === c.sessionId);
                    return (
                      <li key={i} style={{ background: "var(--grey-50)", borderRadius: 12, padding: "12px 14px", fontSize: 13.5 }}>
                        <div className="flex items-center gap8" style={{ marginBottom: 6 }}>
                          {sess && <TypeBadge type={sess.type} />}
                          <span style={{ fontWeight: 700 }}>
                            {sess ? `Uke ${sess.week} · ${sess.title}` : `Økt #${c.sessionId}`}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, color: "var(--t-langtur)" }}>
                          <i className="fa-solid fa-pen-to-square" style={{ marginRight: 7, fontSize: 12 }} />
                          {c.change}
                        </div>
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>{c.reason}</div>
                        <details style={{ marginTop: 6 }}>
                          <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>Detaljer</summary>
                          <div className="muted" style={{ fontSize: 12, textDecoration: "line-through", marginTop: 4 }}>{c.before}</div>
                          <div style={{ fontSize: 12.5 }}>→ {c.after}</div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="flex gap8" style={{ marginTop: 16 }}>
              {proposal.changes.length > 0 && (
                <Button onClick={apply} disabled={applying}>
                  <i className={`fa-solid ${applying ? "fa-arrows-rotate fa-spin" : "fa-check"}`} />
                  {applying ? "Bruker endringene…" : "Godta endringer"}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setProposal(null)} disabled={applying}>
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
