import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Settings } from "../api/client";
import { PageTitle, Spinner, Button } from "../components/ui";
import { WEEKDAYS, dateNo } from "../lib/format";
import { computeZones, ZONE_COLORS } from "../lib/zones";

export default function SettingsPage({ onChange }: { onChange: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [maxHr, setMaxHr] = useState(195);
  const [restHr, setRestHr] = useState(50);
  const [watchModel, setWatchModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPw, setGPw] = useState("");
  const [gMsg, setGMsg] = useState("");
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const [homePlace, setHomePlace] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLon, setHomeLon] = useState("");
  const [homeMsg, setHomeMsg] = useState("");
  const [homeBusy, setHomeBusy] = useState(false);
  const [limitHistory, setLimitHistory] = useState(false);
  const [historyMsg, setHistoryMsg] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);

  async function load() {
    const s = await api.settings();
    setSettings(s);
    setDays(s.training.days);
    setMaxHr(s.training.maxHr);
    setRestHr(s.training.restHr);
    setWatchModel(s.training.watchModel ?? "");
    setHomePlace(s.home?.place ?? "");
    setHomeLat(s.home?.lat != null ? String(s.home.lat) : "");
    setHomeLon(s.home?.lon != null ? String(s.home.lon) : "");
    setLimitHistory(!!s.limitHistoryToPlan);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveLimitHistory(checked: boolean) {
    setHistoryBusy(true);
    setHistoryMsg("");
    setLimitHistory(checked); // optimistisk – tilbakestilles ved feil
    try {
      await api.updateSettings({ limitHistoryToPlan: checked });
      setHistoryMsg(
        checked
          ? "Lagret – historikk fra før programstart skjules nå."
          : "Lagret – all historikk vises igjen."
      );
      onChange();
    } catch (e) {
      setLimitHistory(!checked);
      setHistoryMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setHistoryBusy(false);
      setTimeout(() => setHistoryMsg(""), 5000);
    }
  }

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
      const r = await api.updateSettings({ days, maxHr, restHr, watchModel });
      setMsg(r.regenerated ? "Lagret – datoer i programmet er oppdatert." : "Lagret.");
      onChange();
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
    setGBusy(true);
    try {
      const r = await api.connectGarmin(gEmail, gPw);
      if (r.mfaRequired) {
        setMfaNeeded(true);
        setGMsg("Garmin sendte en sikkerhetskode (e-post/SMS/app). Skriv den inn under.");
      } else {
        setGEmail("");
        setGPw("");
        setGMsg("Garmin koblet til ✓");
        await load();
      }
    } catch (e) {
      setGMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setGBusy(false);
    }
  }

  async function submitMfa() {
    setGMsg("");
    setGBusy(true);
    try {
      await api.submitGarminMfa(mfaCode);
      setMfaNeeded(false);
      setMfaCode("");
      setGEmail("");
      setGPw("");
      setGMsg("Garmin koblet til ✓");
      await load();
    } catch (e) {
      setGMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setGBusy(false);
    }
  }

  function useMyPosition() {
    setHomeMsg("");
    if (!navigator.geolocation) {
      setHomeMsg("Fikk ikke tilgang til posisjon – fyll inn manuelt.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHomeLat(String(Math.round(pos.coords.latitude * 10000) / 10000));
        setHomeLon(String(Math.round(pos.coords.longitude * 10000) / 10000));
      },
      () => setHomeMsg("Fikk ikke tilgang til posisjon – fyll inn manuelt.")
    );
  }

  async function saveHome() {
    const lat = parseFloat(homeLat.replace(",", "."));
    const lon = parseFloat(homeLon.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setHomeMsg("Fyll inn både breddegrad og lengdegrad.");
      return;
    }
    setHomeBusy(true);
    setHomeMsg("");
    try {
      await api.updateSettings({ homeLat: lat, homeLon: lon, homePlace: homePlace.trim() || null });
      setHomeMsg("Hjemsted lagret ✓");
      await load();
    } catch (e) {
      setHomeMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setHomeBusy(false);
      setTimeout(() => setHomeMsg(""), 5000);
    }
  }

  async function clearHome() {
    setHomeBusy(true);
    setHomeMsg("");
    try {
      await api.updateSettings({ homeLat: null, homeLon: null, homePlace: null });
      setHomeMsg("Hjemsted fjernet.");
      await load();
    } catch (e) {
      setHomeMsg(`Feil: ${(e as Error).message}`);
    } finally {
      setHomeBusy(false);
      setTimeout(() => setHomeMsg(""), 5000);
    }
  }

  async function disconnectGarmin() {
    await api.disconnectGarmin();
    setMfaNeeded(false);
    setMfaCode("");
    await load();
  }

  if (!settings) return <Spinner />;

  const zones = computeZones(maxHr, restHr);
  const hrr = maxHr - restHr;

  return (
    <div style={{ maxWidth: 720 }}>
      <PageTitle
        title="Innstillinger"
        subtitle="Tilpass programmet og pulssonene dine"
        action={
          <Button onClick={save} disabled={saving || days.length !== 3}>
            <i className={`fa-solid ${saving ? "fa-arrows-rotate fa-spin" : "fa-floppy-disk"}`} />
            {saving ? "Lagrer…" : "Lagre"}
          </Button>
        }
      />
      {msg && (
        <p className="muted" style={{ marginTop: -14, marginBottom: 18, fontSize: 13.5 }}>
          {msg}
        </p>
      )}

      <div className="card mb18">
        <div className="card-head">
          <h3>Treningsdager</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 14 }}>
            Velg tre faste dager. Programmet fordeler de tre øktene (rolig, kvalitet, langtur) på disse.
          </p>
          <div className="daytoggle">
            {WEEKDAYS.map((d) => (
              <button key={d.key} className={days.includes(d.key) ? "on" : ""} onClick={() => toggleDay(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, fontWeight: 600 }}>{days.length}/3 valgt</div>
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Puls (Karvonen)</h3>
        </div>
        <div className="card-body">
          <div className="grid g2">
            <div className="field">
              <label>Makspuls</label>
              <input className="input" type="number" value={maxHr} onChange={(e) => setMaxHr(Number(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label>Hvilepuls</label>
              <input className="input" type="number" value={restHr} onChange={(e) => setRestHr(Number(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Pulsklokke</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 14 }}>
            Hvilken klokke bruker du? AI-treneren bruker dette til å gi presise oppsettstips for hver økt.
          </p>
          <input className="input" value={watchModel} onChange={(e) => setWatchModel(e.target.value)} placeholder="F.eks. Garmin Forerunner 255" />
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Pulssoner (Karvonen)</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 8 }}>
            Beregnet ut fra makspuls {maxHr} og hvilepuls {restHr}. Oppdateres når du endrer verdiene over.
          </p>
          {zones.map((z) => (
            <div key={z.zone} className="flex items-center" style={{ padding: "11px 0", borderBottom: "1px solid var(--border-subtle)", gap: 14 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: ZONE_COLORS[z.zone - 1], flexShrink: 0 }} />
              <b style={{ fontSize: 13.5, width: 26 }}>S{z.zone}</b>
              <span style={{ fontSize: 14, flex: 1 }}>{z.name}</span>
              <div style={{ flex: "1 1 120px", maxWidth: 200 }} className="hide-m">
                <div style={{ height: 7, borderRadius: 99, background: "var(--grey-150)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: ZONE_COLORS[z.zone - 1], width: `${hrr > 0 ? ((z.max - restHr) / hrr) * 100 : 0}%` }} />
                </div>
              </div>
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, width: 110, textAlign: "right" }}>
                {z.min}–{z.max} bpm
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Løp</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 10 }}>Målløpet ditt — driver nedtellingen og hele planen.</p>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {settings.race.name}
            {settings.race.date ? ` – ${dateNo(settings.race.date)}` : " – dato ikke satt"}
          </div>
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Treningsplan</h3>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 12 }}>
            La AI-treneren lage en ny, tilpasset plan ut fra oppdaterte mål eller form.
          </p>
          <Link to="/onboarding" className="btn btn-ai">
            <i className="fa-solid fa-wand-magic-sparkles" />
            Regenerer plan med AI
          </Link>
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Hjemsted (for værmelding)</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {settings.home?.lat != null && settings.home?.lon != null
              ? `${settings.home.place ? `${settings.home.place} · ` : ""}${settings.home.lat}, ${settings.home.lon}`
              : "Ikke satt"}
          </span>
        </div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 14 }}>
            Sett hvor du pleier å løpe, så viser vi værmelding fra yr på de kommende øktene dine.
          </p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Stedsnavn (valgfritt)</label>
            <input
              className="input"
              value={homePlace}
              onChange={(e) => setHomePlace(e.target.value)}
              placeholder="F.eks. Bergen"
            />
          </div>
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Breddegrad (lat)</label>
              <input
                className="input"
                type="number"
                step="0.0001"
                value={homeLat}
                onChange={(e) => setHomeLat(e.target.value)}
                placeholder="60.3913"
              />
            </div>
            <div className="field">
              <label>Lengdegrad (lon)</label>
              <input
                className="input"
                type="number"
                step="0.0001"
                value={homeLon}
                onChange={(e) => setHomeLon(e.target.value)}
                placeholder="5.3221"
              />
            </div>
          </div>
          <div className="flex gap8 wrap">
            <Button variant="secondary" onClick={useMyPosition} disabled={homeBusy}>
              <i className="fa-solid fa-location-crosshairs" />
              Bruk min posisjon
            </Button>
            <Button onClick={saveHome} disabled={homeBusy || !homeLat || !homeLon}>
              <i className={`fa-solid ${homeBusy ? "fa-arrows-rotate fa-spin" : "fa-floppy-disk"}`} />
              Lagre hjemsted
            </Button>
            {settings.home?.lat != null && (
              <Button variant="ghost" onClick={clearHome} disabled={homeBusy}>
                Fjern
              </Button>
            )}
          </div>
          {homeMsg && (
            <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
              {homeMsg}
            </p>
          )}
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Historikk</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {limitHistory ? "Fra programstart" : "Alt vises"}
          </span>
        </div>
        <div className="card-body">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={limitHistory}
              disabled={historyBusy}
              onChange={(e) => saveLimitHistory(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                Vis kun historikk fra programstart
              </span>
              <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 3 }}>
                Skjuler økter, rekorder, vekt og grafer fra før programmets første økt.
                Ingenting slettes – slå av bryteren for å se alt igjen.
              </span>
            </span>
          </label>
          {historyMsg && (
            <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
              {historyMsg}
            </p>
          )}
        </div>
      </div>

      <div className="card mb18">
        <div className="card-head">
          <h3>Garmin Connect</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {settings.garminConnected ? "Tilkoblet ✓" : "Ikke tilkoblet"}
            {settings.lastSync ? ` · sist synket ${dateNo(settings.lastSync)}` : ""}
          </span>
        </div>
        <div className="card-body">
          {settings.garminConnected ? (
            <Button variant="ghost" onClick={disconnectGarmin}>
              Koble fra Garmin
            </Button>
          ) : mfaNeeded ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 14, margin: 0 }}>
                Garmin-kontoen har to-faktor. Skriv inn sikkerhetskoden du fikk på e-post/SMS/app.
              </p>
              <div className="flex gap12 wrap">
                <input
                  className="input"
                  style={{ flex: "1 1 180px", letterSpacing: "0.2em" }}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && mfaCode && !gBusy && submitMfa()}
                  placeholder="Sikkerhetskode"
                  inputMode="numeric"
                  autoFocus
                />
                <Button onClick={submitMfa} disabled={!mfaCode || gBusy}>
                  {gBusy ? "Logger inn…" : "Bekreft kode"}
                </Button>
              </div>
              <span
                className="link muted"
                style={{ fontSize: 12.5 }}
                onClick={() => {
                  setMfaNeeded(false);
                  setMfaCode("");
                  setGMsg("");
                }}
              >
                Avbryt
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                Logg inn med din Garmin-konto for å hente treningsøktene dine automatisk. Passordet lagres kryptert.
              </p>
              <div className="flex gap12 wrap">
                <input className="input" style={{ flex: "1 1 180px" }} value={gEmail} onChange={(e) => setGEmail(e.target.value)} placeholder="Garmin e-post" />
                <input
                  className="input"
                  style={{ flex: "1 1 180px" }}
                  type="password"
                  value={gPw}
                  onChange={(e) => setGPw(e.target.value)}
                  placeholder="Garmin passord"
                />
                <Button onClick={connectGarmin} disabled={!gEmail || !gPw || gBusy}>
                  {gBusy ? "Logger inn…" : "Koble til"}
                </Button>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Har kontoen to-faktor (MFA)? Det støttes nå – du blir bedt om koden etter at du trykker «Koble til».
              </p>
            </div>
          )}
          {gMsg && (
            <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
              {gMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
