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

// Sporty-Plania accents (matcher design.css --t-*)
export const SESSION_COLORS: Record<string, string> = {
  easy: "#2F8FB0", // rolig / aerob
  quality: "#E59B2E", // kvalitet
  long: "#7A52CC", // langtur
  race: "#D7263D", // løp
};

export const SESSION_LABELS: Record<string, string> = {
  easy: "Rolig",
  quality: "Kvalitet",
  long: "Langtur",
  race: "Løp",
};

// Mapper øktas type-nøkkel (DB) til design.css chip-klassesuffiks
export const TYPE_DESIGN: Record<string, string> = {
  easy: "rolig",
  quality: "kvalitet",
  long: "langtur",
  race: "lop",
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
