import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
  Area, ComposedChart,
} from "recharts";
import { api, WorkoutDetail as WD, AiMessage, Settings } from "../api/client";
import { Card, PageTitle, Stat, Spinner, Button, TypeBadge } from "../components/ui";
import { dateNo, dist, duration, pace } from "../lib/format";
import { computeZones, zoneSecondsFromStreams, ZONE_COLORS } from "../lib/zones";
import { Markdown } from "../components/Markdown";

const C_HR = "#D7263D";
const C_PACE = "#2C4894";
const C_ELEV = "#0E8540";

// Merkelapper for runde-roller fra serveren (intervall-deteksjon)
const LAP_ROLES: Record<string, { label: string; color: string; bg: string }> = {
  work: { label: "Drag", color: "var(--primary-600)", bg: "var(--primary-100)" },
  recovery: { label: "Pause", color: "var(--grey-600)", bg: "var(--grey-100)" },
  warmup: { label: "Oppv.", color: "var(--grey-600)", bg: "var(--grey-100)" },
  cooldown: { label: "Nedj.", color: "var(--grey-600)", bg: "var(--grey-100)" },
};

function LapRoleBadge({ role }: { role?: string }) {
  const r = role ? LAP_ROLES[role] : undefined;
  if (!r) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: role === "work" ? 800 : 600,
        color: r.color,
        background: r.bg,
        borderRadius: 9999,
        padding: "2px 9px",
        letterSpacing: 0.2,
      }}
    >
      {r.label}
    </span>
  );
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wid = Number(id);
  const [w, setW] = useState<WD | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  // Kombinert forløpsgraf: hvilke serier som vises + fullskjerm
  const [showSeries, setShowSeries] = useState({ alt: true, hr: true, pace: false });
  const [fs, setFs] = useState(false);

  useEffect(() => {
    // Nullstill før lasting, ellers vises forrige økt mens den nye hentes
    setLoading(true);
    setW(null);
    setMessages([]);
    setError(null);
    setChatInput("");
    if (!Number.isFinite(wid)) {
      setLoading(false);
      return;
    }
    let alive = true; // ignorer svar som kommer etter at brukeren har navigert videre
    (async () => {
      try {
        const [data, st] = await Promise.all([api.workout(wid), api.settings()]);
        if (!alive) return;
        setW(data);
        setSettings(st);
        setMessages(data.aiMessages);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [wid, reloadKey]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function evaluate() {
    setEvaluating(true);
    try {
      const msg = await api.evaluate(wid);
      setMessages((m) => [...m, msg]);
    } catch (e) {
      alert(`AI-vurdering feilet: ${(e as Error).message}`);
    } finally {
      setEvaluating(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatting(true);
    setMessages((m) => [
      ...m,
      { id: -Date.now(), role: "user", content: text, kind: "chat", createdAt: new Date().toISOString() },
    ]);
    try {
      const reply = await api.chat(wid, text);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      alert(`Chat feilet: ${(e as Error).message}`);
    } finally {
      setChatting(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        "Slette denne økten?\n\nDen kobles fra en evt. planlagt økt og synkroniseres IKKE inn igjen fra Garmin senere."
      )
    )
      return;
    setDeleting(true);
    try {
      await api.deleteWorkout(wid);
      navigate("/okter");
    } catch (e) {
      alert(`Sletting feilet: ${(e as Error).message}`);
      setDeleting(false);
    }
  }

  if (!Number.isFinite(wid))
    return (
      <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>Ikke funnet.</p>
        <Link to="/okter" className="btn btn-ghost">
          <i className="fa-solid fa-arrow-left" />
          Alle økter
        </Link>
      </Card>
    );
  if (error)
    return (
      <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>Kunne ikke laste innhold.</p>
        <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
          <i className="fa-solid fa-arrows-rotate" />
          Prøv igjen
        </Button>
      </Card>
    );
  if (loading || !w || !settings) return <Spinner />;

  const feedback = messages.filter((m) => m.kind === "feedback");
  const chat = messages.filter((m) => m.kind === "chat");

  // Felles forløpsdata med distanse (km) som x-akse. Bruk distanceKm fra strømmen,
  // ellers rekonstruer kumulativ distanse fra tempo over tid (eldre økter).
  const hasAltitude = w.streams.some((p) => p.altitude != null);
  const hasHr = w.streams.some((p) => p.hr != null);
  let cumKm = 0;
  const flow = w.streams.map((p, i) => {
    if (i > 0) {
      const dt = p.t - w.streams[i - 1].t;
      const pc = w.streams[i - 1].paceSecPerKm;
      if (dt > 0 && pc && pc > 0) cumKm += dt / pc;
    }
    const km = p.distanceKm != null ? p.distanceKm : cumKm;
    return {
      km: Math.round(km * 100) / 100,
      hr: p.hr ?? null,
      pace: p.paceSecPerKm && p.paceSecPerKm < 900 ? p.paceSecPerKm : null,
      altitude: p.altitude ?? null,
    };
  });
  const show = {
    alt: showSeries.alt && hasAltitude,
    hr: showSeries.hr && hasHr,
    // Uten både høyde- og pulsdata vises tempo som standard, ellers blir grafen tom
    pace: showSeries.pace || (!hasAltitude && !hasHr),
  };

  const zones = computeZones(settings.training.maxHr, settings.training.restHr);
  const zoneSeconds = zoneSecondsFromStreams(w.streams, zones);
  const zoneData = zones
    .map((z) => ({ zone: `S${z.zone}`, idx: z.zone, min: Math.round((zoneSeconds[z.zone] ?? 0) / 60) }))
    .filter((z) => z.min > 0);

  // Oppsummering av dragene når serveren har gjenkjent økten som intervaller
  const wsum = w.workSummary && w.workSummary.count > 0 ? w.workSummary : null;
  const workStatValue = wsum
    ? `${wsum.count}${wsum.avgWorkDurationSec != null ? ` × ${duration(Math.round(wsum.avgWorkDurationSec))}` : ""}${
        wsum.avgWorkPaceSecPerKm != null ? ` @ ${pace(wsum.avgWorkPaceSecPerKm)}/km` : ""
      }`
    : null;
  const workStatHint = wsum
    ? wsum.avgWorkHr != null
      ? `snittpuls i drag ${Math.round(wsum.avgWorkHr)}`
      : wsum.avgRecoverySec != null
      ? `snittpause ${duration(Math.round(wsum.avgRecoverySec))}`
      : undefined
    : undefined;

  const flowChart = (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={flow} margin={{ left: -6, right: 6, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C_ELEV} stopOpacity={0.45} />
            <stop offset="100%" stopColor={C_ELEV} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
        <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} unit=" km" tick={{ fontSize: 11 }} stroke="#CACACE" />
        {show.alt && <YAxis yAxisId="alt" hide domain={["dataMin - 8", "dataMax + 8"]} />}
        {show.hr && (
          <YAxis yAxisId="hr" width={40} stroke={C_HR} tick={{ fontSize: 11 }} domain={["dataMin - 10", "dataMax + 10"]} />
        )}
        {show.pace && (
          <YAxis
            yAxisId="pace"
            orientation="right"
            reversed
            width={52}
            stroke={C_PACE}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => pace(v)}
            domain={["dataMin - 20", "dataMax + 20"]}
          />
        )}
        <Tooltip
          formatter={(value, name) =>
            name === "altitude"
              ? [`${Math.round(value as number)} m`, "Høyde"]
              : name === "pace"
              ? [`${pace(value as number)} /km`, "Tempo"]
              : [`${value} bpm`, "Puls"]
          }
          labelFormatter={(l) => `${l} km`}
        />
        {show.alt && (
          <Area
            yAxisId="alt"
            type="monotone"
            dataKey="altitude"
            name="altitude"
            stroke={C_ELEV}
            strokeWidth={1.5}
            fill="url(#elev)"
            connectNulls
            dot={false}
            isAnimationActive={false}
          />
        )}
        {show.hr && (
          <Line yAxisId="hr" type="monotone" dataKey="hr" name="hr" stroke={C_HR} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        )}
        {show.pace && (
          <Line yAxisId="pace" type="monotone" dataKey="pace" name="pace" stroke={C_PACE} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );

  const toggle = (k: "alt" | "hr" | "pace", color: string, label: string) => {
    const disabled = (k === "alt" && !hasAltitude) || (k === "hr" && !hasHr);
    const on = show[k];
    return (
      <button
        onClick={() => setShowSeries((s) => ({ ...s, [k]: !s[k] }))}
        disabled={disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 13px",
          borderRadius: 9999,
          border: `1.5px solid ${on ? color : "var(--border-default)"}`,
          background: on ? `${color}1A` : "#fff",
          color: on ? color : "var(--fg-secondary)",
          fontWeight: 600,
          fontSize: 13,
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: on ? color : "var(--grey-400)" }} />
        {label}
      </button>
    );
  };

  const toggles = (
    <div className="flex gap8 wrap" style={{ marginBottom: 12 }}>
      {toggle("alt", C_ELEV, hasAltitude ? "Høyde" : "Høyde (ingen data)")}
      {toggle("hr", C_HR, hasHr ? "Puls" : "Puls (ingen data)")}
      {toggle("pace", C_PACE, "Tempo")}
    </div>
  );

  return (
    <div>
      <PageTitle
        title={w.name || w.sport || "Økt"}
        subtitle={dateNo(w.startTime)}
        action={
          <div className="flex items-center gap8">
            <Link to="/okter" className="btn btn-ghost">
              <i className="fa-solid fa-arrow-left" />
              Alle økter
            </Link>
            <Button variant="danger" onClick={remove} disabled={deleting}>
              <i className="fa-regular fa-trash-can" />
              {deleting ? "Sletter…" : "Slett økt"}
            </Button>
          </div>
        }
      />

      {w.plannedSession && (
        <div className="flex items-center gap8" style={{ marginBottom: 16, fontSize: 13.5 }}>
          <span className="muted">Koblet til planlagt økt:</span>
          <TypeBadge type={w.plannedSession.type} />
          <Link to={`/plan/${w.plannedSession.id}`} className="link" style={{ fontWeight: 700 }}>
            {w.plannedSession.title}
          </Link>
        </div>
      )}

      <div className="grid g4 stats-grid">
        <Stat label="Distanse" value={dist(w.distanceKm)} />
        <Stat label="Tid" value={duration(w.durationSec)} />
        <Stat label="Snittempo" value={`${pace(w.avgPaceSecPerKm)} /km`} />
        <Stat label="Snitt / maks puls" value={`${w.avgHr ?? "–"} / ${w.maxHr ?? "–"}`} />
        {workStatValue && <Stat label="Drag" value={workStatValue} hint={workStatHint} />}
      </div>

      {/* Kombinert forløp: puls · tempo · høyde, distanse på x-aksen, av/på per serie */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>Forløp</h3>
          <div className="flex items-center gap12">
            <span className="muted" style={{ fontSize: 12 }}>
              total stigning {w.elevationGainM != null ? `${Math.round(w.elevationGainM)} m` : "–"}
            </span>
            <button
              className="link"
              onClick={() => setFs(true)}
              style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit" }}
            >
              <i className="fa-solid fa-up-right-and-down-left-from-center" /> Fullskjerm
            </button>
          </div>
        </div>
        <div className="card-body">
          {toggles}
          <div className="flow-box">{flowChart}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>Tid i pulssoner (min)</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            maks {settings.training.maxHr} · hvile {settings.training.restHr}
          </span>
        </div>
        <div className="card-body">
          {zoneData.length === 0 ? (
            <p className="muted" style={{ margin: 0, textAlign: "center", padding: "30px 10px", fontSize: 13.5 }}>
              Ingen pulsdata for denne økten.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={zoneData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ECEDEE" />
                <XAxis dataKey="zone" tick={{ fontSize: 12 }} stroke="#CACACE" />
                <YAxis tick={{ fontSize: 11 }} stroke="#CACACE" />
                <Tooltip formatter={(v) => [`${v} min`, "Tid"]} />
                <Bar dataKey="min" radius={[6, 6, 0, 0]}>
                  {zoneData.map((z) => (
                    <Cell key={z.idx} fill={ZONE_COLORS[z.idx - 1]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
            {zones.map((z) => (
              <div key={z.zone} className="flex items-center gap8">
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: ZONE_COLORS[z.zone - 1] }} />
                <span style={{ fontWeight: 600 }}>S{z.zone}</span>
                <span className="muted">{z.name}</span>
                <span className="muted tnum" style={{ marginLeft: "auto" }}>{z.min}–{z.max} bpm</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fullskjerm-graf (liggende på mobil) */}
      {fs &&
        createPortal(
          <div className="chart-fs">
            <button className="chart-fs-close btn btn-ghost btn-sm" onClick={() => setFs(false)}>
              <i className="fa-solid fa-xmark" /> Lukk
            </button>
            <div className="chart-fs-toggles">{toggles}</div>
            <div className="chart-fs-canvas">{flowChart}</div>
          </div>,
          document.body
        )}

      {w.laps.length > 1 &&
        (() => {
          // Type-kolonnen vises bare når serveren faktisk har rolle-info (eldre svar mangler den)
          const hasRoles = w.laps.some((l) => l.role && l.role !== "unknown");
          return (
            <div className="card" style={{ marginTop: 18, overflow: "hidden" }}>
              <div className="card-head">
                <h3>Runder</h3>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    {hasRoles && <th>Type</th>}
                    <th className="r">Distanse</th>
                    <th className="r">Tid</th>
                    <th className="r">Tempo</th>
                    <th className="r">Puls</th>
                  </tr>
                </thead>
                <tbody>
                  {w.laps.map((l) => (
                    <tr key={l.index} style={l.role === "work" ? { fontWeight: 700 } : undefined}>
                      <td>{l.index}</td>
                      {hasRoles && (
                        <td>
                          <LapRoleBadge role={l.role} />
                        </td>
                      )}
                      <td className="r tnum">{dist(l.distanceKm)}</td>
                      <td className="r tnum">{duration(l.durationSec)}</td>
                      <td className="r tnum">{pace(l.avgPaceSecPerKm)}</td>
                      <td className="r tnum">{l.avgHr ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

      {/* AI-vurdering og chat */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "var(--t-langtur)", marginRight: 9 }} />
            AI-trener
          </h3>
          {feedback.length === 0 && (
            <Button variant="ai" onClick={evaluate} disabled={evaluating}>
              <i className={`fa-solid ${evaluating ? "fa-arrows-rotate fa-spin" : "fa-comment-dots"}`} />
              {evaluating ? "Vurderer…" : "Få vurdering"}
            </Button>
          )}
        </div>
        <div className="card-body">
          {feedback.map((m) => (
            <div key={m.id} style={{ marginBottom: 16, background: "var(--primary-50)", borderRadius: 12, padding: 16 }}>
              <Markdown>{m.content}</Markdown>
            </div>
          ))}

          {(feedback.length > 0 || chat.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {chat.map((m) =>
                m.role === "user" ? (
                  <div
                    key={m.id}
                    style={{
                      marginLeft: "auto",
                      maxWidth: "85%",
                      background: "var(--primary-500)",
                      color: "#fff",
                      borderRadius: 16,
                      padding: "10px 16px",
                      fontSize: 14,
                    }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div key={m.id} style={{ maxWidth: "85%", background: "var(--grey-100)", borderRadius: 16, padding: "10px 16px" }}>
                    <Markdown>{m.content}</Markdown>
                  </div>
                )
              )}
              {chatting && <div className="muted" style={{ fontSize: 13.5 }}>AI skriver…</div>}
              <div ref={chatEnd} />
            </div>
          )}

          {feedback.length > 0 && (
            <div className="flex gap8" style={{ marginTop: 16 }}>
              <input
                className="input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Still et oppfølgingsspørsmål…"
              />
              <Button onClick={sendChat} disabled={chatting || !chatInput.trim()}>
                Send
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
