import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Settings } from "../api/client";
import { Card, PageTitle, Spinner, Button } from "../components/ui";
import { WEEKDAYS, dateNo } from "../lib/format";
import { computeZones, ZONE_COLORS } from "../lib/zones";

export default function SettingsPage({ onChange }: { onChange: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [maxHr, setMaxHr] = useState(195);
  const [restHr, setRestHr] = useState(50);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPw, setGPw] = useState("");
  const [gMsg, setGMsg] = useState("");

  async function load() {
    const s = await api.settings();
    setSettings(s);
    setDays(s.training.days);
    setMaxHr(s.training.maxHr);
    setRestHr(s.training.restHr);
  }
  useEffect(() => {
    load();
  }, []);

  function toggleDay(key: string) {
    setDays((d) => {
      if (d.includes(key)) return d.filter((x) => x !== key);
      if (d.length >= 3) return [...d.slice(1), key];
      return [...d, key];
    });
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const r = await api.updateSettings({ days, maxHr, restHr });
      setMsg(r.regenerated ? "Lagret – datoer i programmet er oppdatert." : "Lagret.");
      await load();
    } catch (e) {
      setMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 5000);
    }
  }

  async function connectGarmin() {
    setGMsg("");
    try {
      await api.connectGarmin(gEmail, gPw);
      setGEmail("");
      setGPw("");
      setGMsg("Garmin koblet til ✓");
      await load();
    } catch (e) {
      setGMsg(`Feil: ${(e as Error).message}`);
    }
  }

  async function disconnectGarmin() {
    await api.disconnectGarmin();
    await load();
  }

  if (!settings) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <PageTitle title="Innstillinger" />

      <Card className="mb-6">
        <h3 className="mb-1 font-semibold text-slate-700">Treningsdager</h3>
        <p className="mb-4 text-sm text-slate-400">
          Velg tre faste dager. Programmet fordeler de tre øktene (rolig, kvalitet, langtur) på disse.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const active = days.includes(d.key);
            return (
              <button
                key={d.key}
                onClick={() => toggleDay(d.key)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  active ? "bg-brand-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">{days.length}/3 valgt</p>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-4 font-semibold text-slate-700">Puls (Karvonen)</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-slate-600">Makspuls</span>
            <input
              type="number"
              value={maxHr}
              onChange={(e) => setMaxHr(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-600">Hvilepuls</span>
            <input
              type="number"
              value={restHr}
              onChange={(e) => setRestHr(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-1 font-semibold text-slate-700">Pulssoner (Karvonen)</h3>
        <p className="mb-4 text-sm text-slate-400">
          Beregnet ut fra makspuls {maxHr} og hvilepuls {restHr}. Oppdateres når du endrer verdiene over.
        </p>
        <div className="space-y-1.5">
          {computeZones(maxHr, restHr).map((z) => (
            <div key={z.zone} className="flex items-center gap-3 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ZONE_COLORS[z.zone - 1] }} />
              <span className="w-8 font-medium text-slate-600">S{z.zone}</span>
              <span className="text-slate-400">{z.name}</span>
              <span className="ml-auto tabular-nums font-medium text-slate-700">
                {z.min}–{z.max} bpm
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-8 flex items-center gap-3">
        <Button onClick={save} disabled={saving || days.length !== 3}>
          {saving ? "Lagrer…" : "Lagre"}
        </Button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold text-slate-700">Løp</h3>
        <div className="text-sm text-slate-600">
          {settings.race.name}
          {settings.race.date ? ` – ${dateNo(settings.race.date)}` : " – dato ikke satt"}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-1 font-semibold text-slate-700">Treningsplan</h3>
        <p className="mb-3 text-sm text-slate-400">
          La AI-treneren lage en ny, tilpasset plan ut fra oppdaterte mål eller form.
        </p>
        <Link to="/onboarding">
          <Button variant="soft">✨ Regenerer plan med AI</Button>
        </Link>
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Garmin Connect</h3>
          <span className="text-xs text-slate-400">
            {settings.garminConnected ? "Tilkoblet ✓" : "Ikke tilkoblet"}
            {settings.lastSync ? ` · sist synket ${dateNo(settings.lastSync)}` : ""}
          </span>
        </div>
        {settings.garminConnected ? (
          <Button variant="ghost" onClick={disconnectGarmin}>
            Koble fra Garmin
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Logg inn med din Garmin-konto for å hente treningsøktene dine automatisk. Passordet lagres kryptert.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={gEmail}
                onChange={(e) => setGEmail(e.target.value)}
                placeholder="Garmin e-post"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
              />
              <input
                type="password"
                value={gPw}
                onChange={(e) => setGPw(e.target.value)}
                placeholder="Garmin passord"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
              />
              <Button onClick={connectGarmin} disabled={!gEmail || !gPw}>
                Koble til
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Har kontoen to-faktor (MFA)? Da må admin koble til via serveren foreløpig.
            </p>
          </div>
        )}
        {gMsg && <p className="mt-2 text-sm text-slate-500">{gMsg}</p>}
      </Card>
    </div>
  );
}
