import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, PlannedSession, Settings } from "../api/client";
import { Card, PageTitle, Spinner, Button, TypeBadge, StatusBadge } from "../components/ui";
import { dateNo, dist, duration, pace } from "../lib/format";
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
    // Hent (eller generer) klokketips – caches på serveren per økt + klokkemodell
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

  const check = (ok: boolean | null) => (ok == null ? "" : ok ? " ✅" : " ⚠️");

  return (
    <div>
      <PageTitle
        title={s.title}
        subtitle={`${dateNo(s.date)} · Uke ${s.week} · ${s.phaseName}`}
        action={
          <Link to="/program" className="text-sm text-brand-600 hover:underline">
            ← Programmet
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <TypeBadge type={s.type} />
        <StatusBadge status={s.status} />
        {s.aiAdjusted && <span className="text-xs text-brand-600">✨ AI-justert</span>}
      </div>

      {/* Slik skal økten gjennomføres */}
      <Card className="mb-6">
        <h3 className="mb-2 font-semibold text-slate-700">Slik skal økten gjennomføres</h3>
        <p className="text-sm leading-relaxed text-slate-600">{s.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {s.targetZone && (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Målsone</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                {tz[0] && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_COLORS[tz[0].zone - 1] }} />
                )}
                {s.targetZone}
              </div>
              {hrRange && <div className="text-xs text-slate-500">{hrRange}</div>}
            </div>
          )}
          {paceRange && (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Måltempo</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-700">{paceRange}</div>
            </div>
          )}
          {s.plannedDistanceKm && (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-400">Distanse</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-700">{dist(s.plannedDistanceKm)}</div>
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-400">Dato</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-700">{dateNo(s.date)}</div>
          </div>
        </div>

        {s.notes && <p className="mt-3 text-sm italic text-slate-500">📝 {s.notes}</p>}
      </Card>

      {/* Klokkeoppsett (AI) */}
      <Card className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">⌚ Slik setter du opp klokka</h3>
          <div className="flex items-center gap-3">
            {settings.training.watchModel ? (
              <span className="text-xs text-slate-400">{settings.training.watchModel}</span>
            ) : (
              <Link to="/innstillinger" className="text-xs text-brand-600 hover:underline">
                Legg inn klokkemodell i Innstillinger →
              </Link>
            )}
            {tips && !tipsLoading && (
              <button onClick={regenerateTips} className="text-xs text-slate-400 hover:text-brand-600">
                ↻ Oppdater
              </button>
            )}
          </div>
        </div>
        {tipsLoading && <p className="text-sm text-slate-400">AI-treneren skriver klokketips…</p>}
        {tipsError && <p className="text-sm text-rose-500">Kunne ikke hente tips: {tipsError}</p>}
        {tips && !tipsLoading && (
          <div className="rounded-xl bg-brand-50/40 p-4">
            <Markdown>{tips}</Markdown>
          </div>
        )}
      </Card>

      {/* Slik ble den (når koblet til gjennomført økt) */}
      {w && (
        <Card className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Slik ble den</h3>
            <Link to={`/okter/${w.id}`} className="text-sm text-brand-600 hover:underline">
              Full øktdetalj + AI-vurdering →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="py-2"></th>
                <th className="py-2 text-right">Planlagt</th>
                <th className="py-2 text-right">Faktisk</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-50">
                <td className="py-2 text-slate-500">Distanse</td>
                <td className="py-2 text-right text-slate-500">{s.plannedDistanceKm ? dist(s.plannedDistanceKm) : "–"}</td>
                <td className="py-2 text-right font-medium text-slate-700">{dist(w.distanceKm)}</td>
              </tr>
              <tr className="border-t border-slate-50">
                <td className="py-2 text-slate-500">Tempo</td>
                <td className="py-2 text-right text-slate-500">{paceRange ?? "–"}</td>
                <td className="py-2 text-right font-medium text-slate-700">
                  {pace(w.avgPaceSecPerKm)} /km{check(paceOk)}
                </td>
              </tr>
              <tr className="border-t border-slate-50">
                <td className="py-2 text-slate-500">Puls</td>
                <td className="py-2 text-right text-slate-500">{hrRange ?? "–"}</td>
                <td className="py-2 text-right font-medium text-slate-700">
                  {w.avgHr ? `${w.avgHr} bpm snitt` : "–"}{check(hrOk)}
                </td>
              </tr>
              {inZonePct != null && (
                <tr className="border-t border-slate-50">
                  <td className="py-2 text-slate-500">Tid i målsone</td>
                  <td className="py-2 text-right text-slate-500">mest mulig</td>
                  <td className="py-2 text-right font-medium text-slate-700">{inZonePct} %</td>
                </tr>
              )}
              <tr className="border-t border-slate-50">
                <td className="py-2 text-slate-500">Varighet</td>
                <td className="py-2 text-right text-slate-500">–</td>
                <td className="py-2 text-right font-medium text-slate-700">{duration(w.durationSec)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
