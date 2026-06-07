import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, AiMessage, PlannedSession, Settings, Workout } from "../api/client";
import { PageTitle, Spinner, TypeBadge, StatusBadge, Button } from "../components/ui";
import { dateNo, pace, dist, duration } from "../lib/format";
import { computeZones, ZONE_COLORS, Zone } from "../lib/zones";
import { Markdown } from "../components/Markdown";

/** Finn sonene en målsone-tekst («Sone 2», «Sone 3-4», «Sone 2 (137–152)») peker på. */
function targetZones(targetZone: string | null | undefined, zones: Zone[]): Zone[] {
  if (!targetZone) return [];
  // Bruk kun teksten før en evt. parentes – «(137–152)» skal ikke tolkes som soner
  const main = targetZone.split("(")[0];
  const nums = (main.match(/\d/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 5);
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return zones.filter((z) => z.zone >= min && z.zone <= max);
}

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--grey-50)",
        borderRadius: 12,
        padding: "13px 15px",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>{value}</div>
      {sub && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function PlanSessionDetail() {
  const { id } = useParams();
  const sid = Number(id);
  const [s, setS] = useState<PlannedSession | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tips, setTips] = useState<string | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [linking, setLinking] = useState(false);

  async function load() {
    const [session, st, msgs, wos] = await Promise.all([
      api.session(sid),
      api.settings(),
      api.sessionMessages(sid).catch(() => [] as AiMessage[]),
      api.workouts().catch(() => [] as Workout[]),
    ]);
    setS(session);
    setSettings(st);
    setMessages(msgs);
    setWorkouts(wos);
    // Hent (eller generer) øktbeskrivelse – caches på serveren per økt + klokkemodell
    setTipsLoading(true);
    try {
      const r = await api.watchTips(sid);
      setTips(r.tips);
    } catch (e) {
      setTipsError((e as Error).message);
    } finally {
      setTipsLoading(false);
    }
  }

  useEffect(() => {
    setS(null);
    setTips(null);
    setTipsError("");
    setMessages([]);
    setChatInput("");
    load();
  }, [sid]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendChat(text?: string) {
    const q = (text ?? chatInput).trim();
    if (!q || chatting) return;
    setChatInput("");
    setChatting(true);
    setMessages((m) => [
      ...m,
      { id: -Date.now(), role: "user", content: q, kind: "plan_chat", createdAt: new Date().toISOString() },
    ]);
    try {
      const reply = await api.sessionChat(sid, q);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      alert(`Chat feilet: ${(e as Error).message}`);
    } finally {
      setChatting(false);
    }
  }

  async function regenerateTips() {
    setTipsLoading(true);
    setTipsError("");
    try {
      const r = await api.watchTips(sid, true);
      setTips(r.tips);
    } catch (e) {
      setTipsError((e as Error).message);
    } finally {
      setTipsLoading(false);
    }
  }

  async function linkWorkout(workoutId: number | null) {
    setLinking(true);
    try {
      await api.linkSessionWorkout(sid, workoutId);
      await load();
    } catch (e) {
      alert(`Kunne ikke endre kobling: ${(e as Error).message}`);
    } finally {
      setLinking(false);
    }
  }

  if (!s || !settings) return <Spinner />;

  const zones = computeZones(settings.training.maxHr, settings.training.restHr);
  const tz = targetZones(s.targetZone, zones);
  const hrRange = tz.length > 0 ? `${tz[0].min}–${tz[tz.length - 1].max} bpm` : null;
  const paceRange =
    s.targetPaceMinSec && s.targetPaceMaxSec ? `${pace(s.targetPaceMinSec)}–${pace(s.targetPaceMaxSec)} /km` : null;

  const w = s.workout ?? null;

  // Tid i målsone for gjennomført økt
  let inZonePct: number | null = null;
  if (w?.hrZoneSecondsJson && tz.length > 0) {
    const zs = JSON.parse(w.hrZoneSecondsJson) as Record<string, number>;
    const total = Object.values(zs).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const inZone = tz.reduce((sum, z) => sum + (zs[String(z.zone)] ?? 0), 0);
      inZonePct = Math.round((inZone / total) * 100);
    }
  }

  const paceOk =
    w?.avgPaceSecPerKm && s.targetPaceMinSec && s.targetPaceMaxSec
      ? w.avgPaceSecPerKm >= s.targetPaceMinSec && w.avgPaceSecPerKm <= s.targetPaceMaxSec
      : null;
  const hrOk = w?.avgHr && tz.length > 0 ? w.avgHr >= tz[0].min && w.avgHr <= tz[tz.length - 1].max : null;

  const check = (ok: boolean | null) =>
    ok == null ? null : ok ? (
      <i className="fa-solid fa-circle-check" style={{ color: "var(--t-fullfort)", marginLeft: 6 }} />
    ) : (
      <i className="fa-solid fa-triangle-exclamation" style={{ color: "var(--warning-700)", marginLeft: 6 }} />
    );

  const cmp = (label: string, plan: React.ReactNode, act: React.ReactNode) => (
    <div
      className="flex items-center between"
      style={{ padding: "13px 0", borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, flex: "0 0 110px" }}>{label}</div>
      <div className="muted tnum" style={{ flex: 1, textAlign: "right", fontSize: 13.5 }}>
        {plan}
      </div>
      <div className="tnum" style={{ flex: 1, textAlign: "right", fontSize: 14, fontWeight: 700 }}>
        {act}
      </div>
    </div>
  );

  return (
    <>
      <PageTitle
        title={s.title}
        subtitle={`${dateNo(s.date)} · Uke ${s.week} · ${s.phaseName}`}
        action={
          <Link to="/program" className="btn btn-ghost">
            <i className="fa-solid fa-arrow-left" />
            Programmet
          </Link>
        }
      />

      <div className="flex items-center gap8" style={{ marginBottom: 18 }}>
        <TypeBadge type={s.type} />
        <StatusBadge status={s.status} />
        {s.aiAdjusted && (
          <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: "var(--t-langtur)", marginRight: 5 }} />
            AI-justert
          </span>
        )}
      </div>

      {/* Slik skal økten gjennomføres */}
      <div className="card mb18">
        <div className="card-head">
          <h3>Slik skal økten gjennomføres</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 15, marginBottom: 16, marginTop: 0 }}>{s.description}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {s.targetZone && (
              <StatTile
                label="Målsone"
                value={
                  <span className="flex items-center" style={{ gap: 7 }}>
                    {tz[0] && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: ZONE_COLORS[tz[0].zone - 1],
                          display: "inline-block",
                        }}
                      />
                    )}
                    {s.targetZone}
                  </span>
                }
                sub={hrRange ?? undefined}
              />
            )}
            {paceRange && <StatTile label="Måltempo" value={paceRange} />}
            {s.plannedDistanceKm != null && <StatTile label="Distanse" value={dist(s.plannedDistanceKm)} />}
            <StatTile label="Dato" value={dateNo(s.date)} />
          </div>
          {s.notes && (
            <p className="muted" style={{ fontStyle: "italic", marginTop: 14, marginBottom: 0, fontSize: 13.5 }}>
              <i className="fa-regular fa-note-sticky" style={{ marginRight: 7 }} />
              {s.notes}
            </p>
          )}
        </div>
      </div>

      {/* Beskrivelse av økten (AI – med liten klokkedel til slutt) */}
      <div className="card mb18">
        <div className="card-head">
          <h3>
            <i className="fa-solid fa-circle-info" style={{ color: "var(--primary-500)", marginRight: 9 }} />
            Beskrivelse av økten
          </h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {settings.training.watchModel ? (
              <>{settings.training.watchModel} · </>
            ) : (
              <>
                <Link to="/innstillinger" className="link">
                  Legg inn klokke
                </Link>{" "}
                ·{" "}
              </>
            )}
            {tips && !tipsLoading && (
              <span className="link" onClick={regenerateTips}>
                <i className="fa-solid fa-arrows-rotate" /> Oppdater
              </span>
            )}
          </span>
        </div>
        <div className="card-body">
          {tipsLoading && (
            <p className="muted" style={{ margin: 0 }}>
              <i className="fa-solid fa-arrows-rotate fa-spin" style={{ marginRight: 8 }} />
              AI-treneren skriver en beskrivelse av økten…
            </p>
          )}
          {tipsError && (
            <p style={{ color: "var(--error-500)", margin: 0 }}>Kunne ikke hente beskrivelsen: {tipsError}</p>
          )}
          {tips && !tipsLoading && <Markdown>{tips}</Markdown>}
        </div>
      </div>

      {/* Spør AI-treneren om denne planlagte økten */}
      <div className="card mb18">
        <div className="card-head">
          <h3>
            <i className="fa-solid fa-comments" style={{ color: "var(--primary-500)", marginRight: 9 }} />
            Spør treneren om økten
          </h3>
        </div>
        <div className="card-body">
          {messages.length === 0 && !chatting && (
            <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
              Lurer du på noe om denne økten? Spør om løype, tempo, oppvarming, vær eller utstyr.
            </p>
          )}

          {messages.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {messages.map((m) =>
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
                  <div
                    key={m.id}
                    style={{ maxWidth: "85%", background: "var(--grey-100)", borderRadius: 16, padding: "10px 16px" }}
                  >
                    <Markdown>{m.content}</Markdown>
                  </div>
                )
              )}
              {chatting && (
                <div className="muted" style={{ fontSize: 13.5 }}>
                  <i className="fa-solid fa-arrows-rotate fa-spin" style={{ marginRight: 8 }} />
                  Treneren tenker…
                </div>
              )}
              <div ref={chatEnd} />
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex gap8 wrap" style={{ marginBottom: 14 }}>
              {[
                "Bør jeg finne en flat løype til denne økten?",
                "Hvordan bør jeg varme opp?",
                "Hva gjør jeg hvis det er kaldt eller regn?",
              ].map((q) => (
                <button
                  key={q}
                  className="chip"
                  style={{ cursor: "pointer", border: "1px solid var(--border-subtle)" }}
                  disabled={chatting}
                  onClick={() => sendChat(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap8">
            <input
              className="input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Skriv et spørsmål om økten…"
            />
            <Button onClick={() => sendChat()} disabled={chatting || !chatInput.trim()}>
              <i className="fa-solid fa-paper-plane" />
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* Tilkoblet treningsøkt – manuell matching */}
      <div className="card mb18">
        <div className="card-head">
          <h3>
            <i className="fa-solid fa-link" style={{ color: "var(--primary-500)", marginRight: 9 }} />
            Tilkoblet treningsøkt
          </h3>
        </div>
        <div className="card-body">
          {w ? (
            <p style={{ marginTop: 0 }}>
              Koblet til <b>{dateNo(w.startTime)}</b> · {dist(w.distanceKm)}
              {w.name ? ` · ${w.name}` : ""}.
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              Ingen treningsøkt er koblet til denne planlagte økten ennå.
            </p>
          )}
          <div className="field" style={{ marginTop: 10, maxWidth: 440 }}>
            <label>Velg treningsøkt</label>
            <select
              className="input"
              value={w?.id ?? ""}
              disabled={linking}
              onChange={(e) => linkWorkout(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Ingen / fjern kobling —</option>
              {workouts.map((x) => (
                <option key={x.id} value={x.id}>
                  {dateNo(x.startTime)} · {dist(x.distanceKm)}
                  {x.name ? ` · ${x.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Overstyrer den automatiske matchingen. Velger du en økt som allerede er koblet til en annen dag, flyttes
            koblingen hit. Fullført-datoen settes til datoen økten faktisk ble gjennomført.
          </p>
        </div>
      </div>

      {/* Slik ble den (når koblet til gjennomført økt) */}
      {w && (
        <div className="card">
          <div className="card-head">
            <h3>Slik ble den</h3>
            <Link to={`/okter/${w.id}`} className="link">
              Full øktdetalj + AI-vurdering →
            </Link>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div
              className="flex between muted"
              style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, padding: "6px 0" }}
            >
              <span style={{ flex: "0 0 110px" }} />
              <span style={{ flex: 1, textAlign: "right" }}>Planlagt</span>
              <span style={{ flex: 1, textAlign: "right" }}>Faktisk</span>
            </div>
            {cmp("Distanse", s.plannedDistanceKm != null ? dist(s.plannedDistanceKm) : "–", dist(w.distanceKm))}
            {cmp(
              "Tempo",
              paceRange ?? "–",
              <>
                {pace(w.avgPaceSecPerKm)} /km
                {check(paceOk)}
              </>
            )}
            {cmp(
              "Puls",
              hrRange ?? "–",
              <>
                {w.avgHr ? `${w.avgHr} bpm snitt` : "–"}
                {check(hrOk)}
              </>
            )}
            {inZonePct != null && cmp("Tid i målsone", "mest mulig", `${inZonePct} %`)}
            {cmp("Varighet", "–", duration(w.durationSec))}
          </div>
        </div>
      )}
    </>
  );
}
