import { WeatherForecast } from "../api/client";

// MET symbol_code-prefiks → emoji (suffikser som _day/_night strippes først)
const SYMBOL_EMOJI: [string, string][] = [
  ["clearsky", "☀️"],
  ["fair", "🌤️"],
  ["partlycloudy", "⛅"],
  ["cloudy", "☁️"],
  ["rainshowers", "🌦️"],
  ["lightrainshowers", "🌦️"],
  ["heavyrainshowers", "🌦️"],
  ["lightrain", "🌧️"],
  ["heavyrain", "🌧️"],
  ["rain", "🌧️"],
  ["sleet", "🌨️"],
  ["snow", "❄️"],
  ["fog", "🌫️"],
  ["thunder", "⛈️"],
];

export function weatherEmoji(symbol?: string | null): string {
  if (!symbol) return "🌡️";
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  for (const [prefix, emoji] of SYMBOL_EMOJI) {
    if (base.startsWith(prefix)) return emoji;
  }
  if (base.includes("thunder")) return "⛈️";
  if (base.includes("snow")) return "❄️";
  if (base.includes("sleet")) return "🌨️";
  if (base.includes("rainshowers")) return "🌦️";
  if (base.includes("rain")) return "🌧️";
  return "🌡️";
}

/** Kompakt værmelding, f.eks. «⛅ 8–13° · 0,4 mm · 6 m/s». */
export function WeatherChip({ forecast }: { forecast?: WeatherForecast | null }) {
  if (!forecast) return null;
  const parts: string[] = [`${Math.round(forecast.tempMin)}–${Math.round(forecast.tempMax)}°`];
  if (forecast.precipMm >= 0.3) parts.push(`${forecast.precipMm.toFixed(1).replace(".", ",")} mm`);
  if (forecast.windMax >= 4) parts.push(`${Math.round(forecast.windMax)} m/s`);
  return (
    <span
      className="muted"
      style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}
      title="Værmelding fra yr"
    >
      {weatherEmoji(forecast.symbol)} {parts.join(" · ")}
    </span>
  );
}
