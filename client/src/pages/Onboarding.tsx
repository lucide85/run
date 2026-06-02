import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, OnboardingAnswers } from "../api/client";
import { Button } from "../components/ui";

export default function Onboarding({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const navigate = useNavigate();
  const [typicalDistanceKm, setTypicalDistanceKm] = useState("");
  const [typicalPace, setTypicalPace] = useState("");
  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDistanceKm, setRaceDistanceKm] = useState("10");
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [maxHr, setMaxHr] = useState("195");
  const [restHr, setRestHr] = useState("50");
  const [other, setOther] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [followup, setFollowup] = useState("");

  function buildAnswers(extraOther?: string): OnboardingAnswers {
    return {
      typicalDistanceKm: parseFloat(typicalDistanceKm) || undefined,
      typicalPace: typicalPace || undefined,
      raceName: raceName || undefined,
      raceDate,
      raceDistanceKm: parseFloat(raceDistanceKm) || 10,
      daysPerWeek: parseInt(daysPerWeek) || 3,
      maxHr: parseInt(maxHr) || undefined,
      restHr: parseInt(restHr) || undefined,
      other: [other, extraOther].filter(Boolean).join("\n"),
    };
  }

  async function submit(force: boolean, extraOther?: string) {
    setError("");
    if (!raceDate) {
      setError("Velg en løpsdato.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.generatePlan(buildAnswers(extraOther), force);
      if (result.needMoreInfo && result.questions?.length) {
        setQuestions(result.questions);
      } else {
        navigate("/");
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  if (questions) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-xl font-bold text-slate-800">Et par oppfølgingsspørsmål 🤔</h1>
          <p className="mt-1 text-sm text-slate-400">AI-treneren vil vite litt mer før planen lages.</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <textarea
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            rows={4}
            placeholder="Skriv svarene dine her…"
            className={field}
          />
          {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={() => submit(true, followup)} disabled={busy}>
              {busy ? "Lager plan…" : "Lag planen min"}
            </Button>
            <Button variant="ghost" onClick={() => setQuestions(null)}>
              Tilbake
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-4xl">🏃</div>
          <h1 className="mt-2 text-xl font-bold text-slate-800">Velkommen, {nickname}!</h1>
          <p className="text-sm text-slate-400">AI-treneren lager en plan tilpasset deg. Svar på noen spørsmål:</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-600">Typisk øktlengde nå (km)</span>
              <input value={typicalDistanceKm} onChange={(e) => setTypicalDistanceKm(e.target.value)} className={field} placeholder="5" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Typisk tempo (min/km)</span>
              <input value={typicalPace} onChange={(e) => setTypicalPace(e.target.value)} className={field} placeholder="6:30" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-slate-600">Navn på løpet (valgfritt)</span>
            <input value={raceName} onChange={(e) => setRaceName(e.target.value)} className={field} placeholder="Sentrumsløpet" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-600">Løpsdato</span>
              <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Løpsdistanse (km)</span>
              <input value={raceDistanceKm} onChange={(e) => setRaceDistanceKm(e.target.value)} className={field} placeholder="10" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm text-slate-600">Dager/uke</span>
              <input value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} className={field} placeholder="3" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Makspuls</span>
              <input value={maxHr} onChange={(e) => setMaxHr(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Hvilepuls</span>
              <input value={restHr} onChange={(e) => setRestHr(e.target.value)} className={field} />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-slate-600">Noe annet treneren bør vite? (skader, erfaring, mål)</span>
            <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={3} className={field} />
          </label>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <Button onClick={() => submit(false)} disabled={busy} className="w-full">
            {busy ? "AI lager planen din…" : "✨ Lag treningsplanen min"}
          </Button>
        </div>
      </div>
    </div>
  );
}
