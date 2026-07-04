import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlannedSession, Workout } from "../api/client";
import { Button } from "./ui";
import {
  COMPANION_STAGES,
  CompanionMood,
  CompanionStage,
  MOOD_CAPTIONS,
  computeMood,
  computeStage,
  nextStageProgress,
  stageImageUrl,
  streakWeeks,
} from "../lib/companion";
import "./companion.css";

/** CSS-vennlige klassenavn uten æøå. */
const MOOD_CLASS: Record<CompanionMood, string> = {
  jubler: "jubler",
  fornøyd: "fornoyd",
  klar: "klar",
  døser: "doser",
};

function storageKey(userId?: number): string {
  return `companion.stage.${userId ?? 0}`;
}

function readStoredStage(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStoredStage(key: string, stage: number): void {
  try {
    localStorage.setItem(key, String(stage));
  } catch {
    /* privat modus e.l. – kompisen tar det pent */
  }
}

export function Companion({
  sessions,
  workouts,
  userId,
}: {
  sessions: PlannedSession[];
  workouts: Workout[];
  userId?: number;
}) {
  const [ceremonyStage, setCeremonyStage] = useState<CompanionStage | null>(null);

  // All beregning i try/catch: feiler noe, rendrer vi heller ingenting
  // enn å velte resten av siden.
  const data = useMemo(() => {
    try {
      return {
        stage: computeStage(sessions),
        mood: computeMood(workouts),
        progress: nextStageProgress(sessions),
        streak: streakWeeks(sessions),
      };
    } catch (e) {
      console.warn("Companion: beregning feilet", e);
      return null;
    }
  }, [sessions, workouts]);

  const key = storageKey(userId);
  const stage = data?.stage;

  // Utviklingsseremoni: vis kun når lagret steg < beregnet steg.
  // Første gang (ingen lagret verdi) lagrer vi stille, uten seremoni.
  useEffect(() => {
    if (stage == null) return;
    const stored = readStoredStage(key);
    if (stored == null || stored > stage) {
      writeStoredStage(key, stage);
      return;
    }
    if (stored < stage) setCeremonyStage(stage);
  }, [stage, key]);

  if (!data) return null;

  const info = COMPANION_STAGES[data.stage];
  if (!info) return null;

  const { mood, progress, streak } = data;
  const pct =
    progress && progress.neededInStage > 0
      ? Math.min(100, (progress.doneInStage / progress.neededInStage) * 100)
      : 100;

  function closeCeremony() {
    if (ceremonyStage != null) writeStoredStage(key, ceremonyStage);
    setCeremonyStage(null);
  }

  return (
    <>
      <div className="card card-pad companion-card fadein">
        <div className="companion-row">
          <div className={`companion-figure-wrap mood-${MOOD_CLASS[mood]}`}>
            <img
              src={stageImageUrl(data.stage)}
              alt={`Treningskompisen din: ${info.name}`}
              className="companion-figure"
              width={130}
              height={130}
            />
            {mood === "døser" && (
              <span className="companion-zzz" aria-hidden="true">
                💤
              </span>
            )}
          </div>

          <div className="companion-info">
            <div className="companion-kicker">Treningskompis</div>
            <div className="companion-name">
              {info.name}
              {streak >= 3 && <span className="companion-streak">🔥 {streak} uker på rad</span>}
            </div>
            <div className="companion-caption">{MOOD_CAPTIONS[mood]}</div>

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
              <div className="companion-progress-label">Maks nivå – for en duo! 🏅</div>
            )}
          </div>

          <Link to="/kompis" className="companion-link">
            Se kompisen →
          </Link>
        </div>
      </div>

      {ceremonyStage != null && COMPANION_STAGES[ceremonyStage] && (
        <div
          className="companion-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Kompisen din har utviklet seg"
        >
          <div className="companion-overlay-inner">
            <img
              src={stageImageUrl(ceremonyStage)}
              alt=""
              className="companion-overlay-figure"
              width={180}
              height={180}
            />
            <div className="companion-overlay-title">
              ✨ Kompisen din har utviklet seg til {COMPANION_STAGES[ceremonyStage].name}!
            </div>
            <div className="companion-overlay-desc">
              {COMPANION_STAGES[ceremonyStage].description}
            </div>
            <Button onClick={closeCeremony}>Fantastisk!</Button>
          </div>
        </div>
      )}
    </>
  );
}
