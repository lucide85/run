export function pace(secPerKm?: number | null): string {
  if (!secPerKm || secPerKm <= 0) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function duration(sec?: number | null): string {
  if (!sec) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}t ${m}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function dist(km?: number | null): string {
  if (km == null) return "–";
  return `${km.toFixed(2)} km`;
}

export function dateNo(iso: string): string {
  return new Date(iso).toLocaleDateString("no-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("no-NO", { day: "numeric", month: "short" });
}

export const SESSION_COLORS: Record<string, string> = {
  easy: "#38bdf8", // sky-400
  quality: "#fb923c", // orange-400
  long: "#a78bfa", // violet-400
  race: "#f43f5e", // rose-500
};

export const SESSION_LABELS: Record<string, string> = {
  easy: "Rolig",
  quality: "Kvalitet",
  long: "Langtur",
  race: "Løp",
};

export const WEEKDAYS = [
  { key: "Mon", label: "Man" },
  { key: "Tue", label: "Tir" },
  { key: "Wed", label: "Ons" },
  { key: "Thu", label: "Tor" },
  { key: "Fri", label: "Fre" },
  { key: "Sat", label: "Lør" },
  { key: "Sun", label: "Søn" },
];
