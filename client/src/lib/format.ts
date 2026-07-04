export function pace(secPerKm?: number | null): string {
  if (!secPerKm || secPerKm <= 0) return "–";
  // Rund av totalen først – ellers kan 299,6 s bli «4:60» i stedet for «5:00»
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
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

/** Sekunder → «h:mm:ss» (over en time) eller «mm:ss». Brukes for rekorder og prognoser. */
export function timeHms(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "–";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function dist(km?: number | null): string {
  if (km == null) return "–";
  return `${km.toFixed(2)} km`;
}

/** ISO 8601-ukenummer (uke 1 = uken med årets første torsdag). */
export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** Året ISO-uken tilhører (kan avvike fra kalenderåret rundt nyttår). */
export function isoWeekYear(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  return date.getUTCFullYear();
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
