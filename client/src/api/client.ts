export interface PlannedSession {
  id: number;
  week: number;
  phase: number;
  phaseName: string;
  type: "easy" | "quality" | "long" | "race";
  slot: number;
  title: string;
  description: string;
  targetZone?: string | null;
  targetPaceMinSec?: number | null;
  targetPaceMaxSec?: number | null;
  plannedDistanceKm?: number | null;
  date: string;
  status: "planned" | "completed" | "skipped" | "moved";
  aiAdjusted: boolean;
  notes?: string | null;
  watchTips?: string | null;
  watchTipsFor?: string | null;
  workoutId?: number | null;
  workout?: Workout | null;
}

export interface Workout {
  id: number;
  garminActivityId: string;
  startTime: string;
  sport?: string | null;
  name?: string | null;
  distanceKm?: number | null;
  durationSec?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgPaceSecPerKm?: number | null;
  elevationGainM?: number | null;
  avgCadence?: number | null;
  calories?: number | null;
  hrZoneSecondsJson?: string | null;
  plannedSession?: PlannedSession | null;
}

export interface WorkoutDetail extends Workout {
  streams: { t: number; hr?: number; paceSecPerKm?: number; altitude?: number; distanceKm?: number; cadence?: number }[];
  laps: { index: number; distanceKm?: number; durationSec?: number; avgHr?: number; avgPaceSecPerKm?: number }[];
  hrZoneSeconds: Record<string, number>;
  aiMessages: AiMessage[];
}

export interface AiMessage {
  id: number;
  workoutId?: number | null;
  role: "user" | "assistant" | "system";
  content: string;
  kind: "feedback" | "chat" | "plan_adjustment";
  createdAt: string;
}

export interface WeightLog {
  id: number;
  date: string;
  weightKg: number;
}

export interface Settings {
  race: { name: string; date: string | null };
  training: { startDate: string; days: string[]; maxHr: number; restHr: number; watchModel: string };
  role: "admin" | "user";
  nickname: string;
  garminConnected: boolean;
  googleEnabled: boolean;
  lastSync?: string | null;
}

export interface Me {
  id: number;
  email: string;
  nickname: string;
  role: "admin" | "user";
  mustOnboard: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  nickname: string;
  role: "admin" | "user";
  mustOnboard: boolean;
  createdAt: string;
  lastGarminSync?: string | null;
}

export interface OnboardingAnswers {
  typicalDistanceKm?: number;
  typicalPace?: string;
  raceName?: string;
  raceDate: string;
  raceDistanceKm: number;
  daysPerWeek: number;
  maxHr?: number;
  restHr?: number;
  other?: string;
}

export interface GenerateResult {
  needMoreInfo?: boolean;
  questions?: string[];
  created?: number;
  summary?: string;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  matched: number;
  errors: string[];
}

export interface PlanProposal {
  /** Markdown: formvurdering + generell begrunnelse for endringene. */
  evaluation: string;
  changes: {
    sessionId: number;
    field: "description" | "title" | "date";
    before: string;
    after: string;
    change: string;
    reason: string;
  }[];
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Feil: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // auth
  authStatus: () => req<{ authenticated: boolean; local: boolean }>("/api/auth/status"),
  login: (username: string, password: string) =>
    req<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => req<Me>("/api/me"),

  // plan
  structure: () => req<any>("/api/plan/structure"),
  sessions: () => req<PlannedSession[]>("/api/plan/sessions"),
  session: (id: number) => req<PlannedSession>(`/api/plan/sessions/${id}`),
  updateSession: (id: number, data: Partial<PlannedSession>) =>
    req<PlannedSession>(`/api/plan/sessions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // workouts
  workouts: () => req<Workout[]>("/api/workouts"),
  workout: (id: number) => req<WorkoutDetail>(`/api/workouts/${id}`),
  deleteWorkout: (id: number, allowResync = false) =>
    req<{ ok: true; ignored: boolean }>(`/api/workouts/${id}${allowResync ? "?resync=true" : ""}`, {
      method: "DELETE",
    }),

  // sync
  sync: (limit = 20) => req<SyncResult>("/api/sync", { method: "POST", body: JSON.stringify({ limit }) }),

  // settings
  settings: () => req<Settings>("/api/settings"),
  updateSettings: (data: Partial<Settings["training"]>) =>
    req<{ ok: true; regenerated: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  connectGarmin: (email: string, password: string) =>
    req<{ ok: true; mfaRequired: boolean }>("/api/settings/garmin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  submitGarminMfa: (code: string) =>
    req<{ ok: true }>("/api/settings/garmin/mfa", { method: "POST", body: JSON.stringify({ code }) }),
  disconnectGarmin: () => req<{ ok: true }>("/api/settings/garmin", { method: "DELETE" }),

  // onboarding / AI-plan
  generatePlan: (answers: OnboardingAnswers, force = false) =>
    req<GenerateResult>("/api/onboarding/generate", { method: "POST", body: JSON.stringify({ answers, force }) }),

  // admin
  adminUsers: () => req<AdminUser[]>("/api/admin/users"),
  adminCreateUser: (email: string, nickname: string) =>
    req<{ id: number; email: string; nickname: string; password: string }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, nickname }),
    }),
  adminResetPassword: (id: number) =>
    req<{ password: string }>(`/api/admin/users/${id}/reset-password`, { method: "POST" }),
  adminDeleteUser: (id: number) => req<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  // weight
  weight: () => req<WeightLog[]>("/api/weight"),
  addWeight: (date: string, weightKg: number) =>
    req<WeightLog>("/api/weight", { method: "POST", body: JSON.stringify({ date, weightKg }) }),
  deleteWeight: (id: number) => req<{ ok: true }>(`/api/weight/${id}`, { method: "DELETE" }),

  // ai
  evaluate: (workoutId: number) =>
    req<AiMessage>(`/api/ai/workouts/${workoutId}/evaluate`, { method: "POST" }),
  aiMessages: (workoutId: number) => req<AiMessage[]>(`/api/ai/workouts/${workoutId}/messages`),
  chat: (workoutId: number, message: string) =>
    req<AiMessage>(`/api/ai/workouts/${workoutId}/chat`, { method: "POST", body: JSON.stringify({ message }) }),
  watchTips: (sessionId: number, force = false) =>
    req<{ tips: string; cached: boolean }>(
      `/api/ai/sessions/${sessionId}/watch-tips${force ? "?force=true" : ""}`,
      { method: "POST" }
    ),
  proposePlan: () => req<PlanProposal>("/api/ai/plan/propose", { method: "POST" }),
  applyPlan: (proposal: PlanProposal) =>
    req<{ ok: true }>("/api/ai/plan/apply", { method: "POST", body: JSON.stringify(proposal) }),
};
