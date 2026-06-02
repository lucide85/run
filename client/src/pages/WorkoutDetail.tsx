import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
  AreaChart, Area,
} from "recharts";
import { api, WorkoutDetail as WD, AiMessage, Settings } from "../api/client";
import { Card, PageTitle, Stat, Spinner, Button, TypeBadge } from "../components/ui";
import { dateNo, dist, duration, pace } from "../lib/format";
import { computeZones, zoneSecondsFromStreams, ZONE_COLORS } from "../lib/zones";
import { Markdown } from "../components/Markdown";

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wid = Number(id);
  const [w, setW] = useState<WD | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  async function load() {
    const [data, st] = await Promise.all([api.workout(wid), api.settings()]);
    setW(data);
    setSettings(st);
    setMessages(data.aiMessages);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [wid]);

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

  if (loading || !w || !settings) return <Spinner />;

  const feedback = messages.filter((m) => m.kind === "feedback");
  const chat = messages.filter((m) => m.kind === "chat");

  const streamData = w.streams.map((p) => ({
    t: Math.round(p.t / 60),
    hr: p.hr,
    pace: p.paceSecPerKm && p.paceSecPerKm < 900 ? p.paceSecPerKm : null,
    altitude: p.altitude,
  }));

  // Høyde som funksjon av distanse (km). Bruk distanceKm fra strømmen,
  // ellers rekonstruer kumulativ distanse fra tempo over tid (eldre økter).
  const hasAltitude = w.streams.some((p) => p.altitude != null);
  let cumKm = 0;
  const elevData = w.streams.map((p, i) => {
    if (i > 0) {
      const dt = p.t - w.streams[i - 1].t;
      const pc = w.streams[i - 1].paceSecPerKm;
      if (dt > 0 && pc && pc > 0) cumKm += dt / pc;
    }
    const km = p.distanceKm != null ? p.distanceKm : cumKm;
    return { km: Math.round(km * 100) / 100, altitude: p.altitude ?? null };
  });

  // Beregn soner dynamisk fra dine innstillinger og fordel tiden basert på pulsstrømmen
  const zones = computeZones(settings.training.maxHr, settings.training.restHr);
  const zoneSeconds = zoneSecondsFromStreams(w.streams, zones);
  const zoneData = zones
    .map((z) => ({ zone: `S${z.zone}`, idx: z.zone, min: Math.round((zoneSeconds[z.zone] ?? 0) / 60) }))
    .filter((z) => z.min > 0);

  return (
    <div>
      <PageTitle
        title={w.name || w.sport || "Økt"}
        subtitle={dateNo(w.startTime)}
        action={
          <div className="flex items-center gap-3">
            <Link to="/okter" className="text-sm text-brand-600 hover:underline">
              ← Alle økter
            </Link>
            <button
              onClick={remove}
              disabled={deleting}
              className="text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
            >
              {deleting ? "Sletter…" : "Slett økt"}
            </button>
          </div>
        }
      />

      {w.plannedSession && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          Koblet til planlagt økt: <TypeBadge type={w.plannedSession.type} />
          <span className="font-medium text-slate-700">{w.plannedSession.title}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Distanse" value={dist(w.distanceKm)} />
        <Stat label="Tid" value={duration(w.durationSec)} />
        <Stat label="Snittempo" value={`${pace(w.avgPaceSecPerKm)} /km`} />
        <Stat label="Snitt / maks puls" value={`${w.avgHr ?? "–"} / ${w.maxHr ?? "–"}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-700">Puls og tempo</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={streamData} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} unit=" min" stroke="#cbd5e1" />
              <YAxis yAxisId="hr" tick={{ fontSize: 11 }} stroke="#f43f5e" domain={["dataMin - 10", "dataMax + 10"]} />
              <YAxis
                yAxisId="pace"
                orientation="right"
                reversed
                tick={{ fontSize: 11 }}
                stroke="#3b82f6"
                tickFormatter={(v) => pace(v)}
                domain={["dataMin - 20", "dataMax + 20"]}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === "pace" ? [`${pace(value as number)} /km`, "Tempo"] : [`${value} bpm`, "Puls"]
                }
                labelFormatter={(l) => `${l} min`}
              />
              <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="#f43f5e" dot={false} strokeWidth={2} name="hr" />
              <Line yAxisId="pace" type="monotone" dataKey="pace" stroke="#3b82f6" dot={false} strokeWidth={2} name="pace" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-700">Tid i pulssoner (min)</h3>
            <span className="text-xs text-slate-400">
              maks {settings.training.maxHr} · hvile {settings.training.restHr}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={zoneData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="zone" tick={{ fontSize: 12 }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip formatter={(v) => [`${v} min`, "Tid"]} />
              <Bar dataKey="min" radius={[6, 6, 0, 0]}>
                {zoneData.map((z) => (
                  <Cell key={z.idx} fill={ZONE_COLORS[z.idx - 1]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {zones.map((z) => (
              <div key={z.zone} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_COLORS[z.zone - 1] }} />
                <span className="font-medium text-slate-600">S{z.zone}</span>
                <span className="text-slate-400">{z.name}</span>
                <span className="ml-auto tabular-nums text-slate-500">{z.min}–{z.max} bpm</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {hasAltitude && (
        <Card className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-700">Høydeprofil</h3>
            <span className="text-xs text-slate-400">
              total stigning {w.elevationGainM != null ? `${Math.round(w.elevationGainM)} m` : "–"}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={elevData} margin={{ left: -10, right: 10 }}>
              <defs>
                <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="km"
                type="number"
                domain={[0, "dataMax"]}
                tick={{ fontSize: 11 }}
                stroke="#cbd5e1"
                tickFormatter={(v) => `${v}`}
                unit=" km"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#10b981"
                unit=" m"
                domain={["dataMin - 5", "dataMax + 5"]}
                tickFormatter={(v) => `${Math.round(v)}`}
              />
              <Tooltip
                formatter={(v) => [`${Math.round(v as number)} m`, "Høyde"]}
                labelFormatter={(l) => `${l} km`}
              />
              <Area
                type="monotone"
                dataKey="altitude"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#elev)"
                connectNulls
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {w.laps.length > 1 && (
        <Card className="mt-6 overflow-x-auto">
          <h3 className="mb-3 font-semibold text-slate-700">Runder</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="py-2">#</th>
                <th className="py-2 text-right">Distanse</th>
                <th className="py-2 text-right">Tid</th>
                <th className="py-2 text-right">Tempo</th>
                <th className="py-2 text-right">Puls</th>
              </tr>
            </thead>
            <tbody>
              {w.laps.map((l) => (
                <tr key={l.index} className="border-t border-slate-50">
                  <td className="py-2">{l.index}</td>
                  <td className="py-2 text-right">{dist(l.distanceKm)}</td>
                  <td className="py-2 text-right">{duration(l.durationSec)}</td>
                  <td className="py-2 text-right">{pace(l.avgPaceSecPerKm)}</td>
                  <td className="py-2 text-right">{l.avgHr ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* AI-vurdering og chat */}
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">✨ AI-trener</h3>
          {feedback.length === 0 && (
            <Button variant="soft" onClick={evaluate} disabled={evaluating}>
              {evaluating ? "Vurderer…" : "Få vurdering"}
            </Button>
          )}
        </div>

        {feedback.map((m) => (
          <div key={m.id} className="mb-4 rounded-xl bg-brand-50/50 p-4">
            <Markdown>{m.content}</Markdown>
          </div>
        ))}

        {(feedback.length > 0 || chat.length > 0) && (
          <div className="space-y-3">
            {chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl bg-brand-600 px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5">
                  <Markdown>{m.content}</Markdown>
                </div>
              )
            )}
            {chatting && <div className="text-sm text-slate-400">AI skriver…</div>}
            <div ref={chatEnd} />
          </div>
        )}

        {feedback.length > 0 && (
          <div className="mt-4 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Still et oppfølgingsspørsmål…"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <Button onClick={sendChat} disabled={chatting || !chatInput.trim()}>
              Send
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
