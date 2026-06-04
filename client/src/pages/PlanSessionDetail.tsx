import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, PlannedSession, Settings } from "../api/client";
import { PageTitle, Spinner, TypeBadge, StatusBadge } from "../components/ui";
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

  async function load() {
    const [session, st] = await Promise.all([api.session(sid), api.settings()]);
    setS(session);
    setSettings(st);
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
    load();
  }, [sid]);

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
