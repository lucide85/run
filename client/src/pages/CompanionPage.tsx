import { useEffect, useState } from "react";
import { api, PlannedSession, Workout } from "../api/client";
import { Button, PageTitle, Spinner } from "../components/ui";
import { dateNo } from "../lib/format";
import {
  COMPANION_STAGES,
  CompanionMood,
  CompanionStage,
  EvolutionEvent,
  MOOD_CAPTIONS,
  STAGE_THRESHOLDS,
  computeMood,
  computeStage,
  evolutionHistory,
  nextStageProgress,
  stageImageUrl,
  streakWeeks,
} from "../lib/companion";
import "../components/companion.css";

export default function CompanionPage() {
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [s, w] = await Promise.all([api.sessions(), api.workouts()]);
      setSessions(s);
      setWorkouts(w);
    } catch (e) {
      console.warn("Kunne ikke laste kompis-siden:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div>
        <PageTitle title="Treningskompis" subtitle="Din trofaste heiagjeng på én" />
        <div className="card card-pad" style={{ maxWidth: 420 }}>
          <p className="muted" style={{ marginTop: 0 }}>Kunne ikke laste innhold.</p>
          <Button onClick={load}>Prøv igjen</Button>
        </div>
      </div>
    );
  }

  // Defensive beregninger – faller tilbake til trygge standardverdier.
  let stage: CompanionStage = 0;
  let mood: CompanionMood = "klar";
  let history: EvolutionEvent[] = [];
  let streak = 0;
  let progress: ReturnType<typeof nextStageProgress> = null;
  try {
    stage = computeStage(sessions);
    mood = computeMood(workouts);
    history = evolutionHistory(sessions);
    streak = streakWeeks(sessions);
    progress = nextStageProgress(sessions);
  } catch (e) {
    console.warn("Kompis-beregning feilet:", e);
  }

  const info = COMPANION_STAGES[stage];
  const pct =
    progress && progress.neededInStage > 0
      ? Math.min(100, (progress.doneInStage / progress.neededInStage) * 100)
      : 100;

  return (
    <div>
      <PageTitle title="Treningskompis" subtitle="Din trofaste heiagjeng på én" />

      {/* Stor figur med humør */}
      <div className="card companion-hero fadein" style={{ marginBottom: 18 }}>
        <img
          src={stageImageUrl(stage)}
          alt={`Treningskompisen din: ${info.name}`}
          className="companion-hero-figure"
          width={220}
          height={220}
        />
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div className="companion-kicker">Steg {stage} av 5</div>
          <div className="companion-hero-name">
            {info.name}
            {streak >= 3 && <span className="companion-streak">🔥 {streak} uker på rad</span>}
          </div>
          <div className="companion-hero-desc">{info.description}</div>
          <div className="companion-caption" style={{ marginTop: 10 }}>{MOOD_CAPTIONS[mood]}</div>

          {progress ? (
            <div className="companion-progress">
              <div className="companion-progress-track">
                <div className="companion-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="companion-progress-label">
                {progress.doneInStage} av {progress.neededInStage} økter til neste utvikling
              </div>
            </div>
          ) : (
            <div className="companion-progress-label" style={{ marginTop: 10 }}>
              Maks nivå – dere har nådd toppen sammen! 🏅
            </div>
          )}
        </div>
      </div>

      {/* Alle utviklingssteg */}
      <div className="card fadein" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>Utviklingssteg</h3>
        </div>
        <div className="card-body">
          <div className="companion-gallery">
            {COMPANION_STAGES.map((s) => {
              const locked = s.stage > stage;
              const current = s.stage === stage;
              return (
                <div
                  key={s.stage}
                  className={`companion-gallery-item ${locked ? "locked" : ""} ${current ? "current" : ""}`}
                >
                  <img
                    src={stageImageUrl(s.stage)}
                    alt={locked ? "Låst utviklingssteg" : s.name}
                    width={84}
                    height={84}
                  />
                  {locked && (
                    <div className="companion-gallery-q" aria-hidden="true">?</div>
                  )}
                  <div className="companion-gallery-name">{locked ? "???" : s.name}</div>
                  <div className="companion-gallery-req">
                    {s.stage === 0
                      ? "start"
                      : s.stage === 5
                        ? `${STAGE_THRESHOLDS[5]}+ økter / løpsdag`
                        : `${STAGE_THRESHOLDS[s.stage]} økter`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Utviklingshistorikk */}
      <div className="card fadein">
        <div className="card-head">
          <h3>Milepæler</h3>
        </div>
        <div className="card-body">
          {history.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              Ingen utviklinger ennå – fullfør økter, så vokser kompisen din! 🥚
            </p>
          ) : (
            <ul className="companion-timeline">
              {history.map((ev) => (
                <li key={ev.stage}>
                  <span className="dot" />
                  <span>
                    Ble til <b>{COMPANION_STAGES[ev.stage]?.name ?? `steg ${ev.stage}`}</b> –{" "}
                    {dateNo(ev.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
