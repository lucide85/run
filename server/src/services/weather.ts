/**
 * Værmelding fra MET/yr (Locationforecast 2.0) for kommende planlagte økter.
 * Gratis og uten nøkkel, men krever identifiserende User-Agent og at man ikke
 * spammer API-et – derfor caches svaret per posisjon i 2 timer i minnet.
 * https://api.met.no/weatherapi/locationforecast/2.0/documentation
 */

const MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const USER_AGENT = "treningsapp-10k/1.0 github.com/lucide85/run";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface MetTimeseries {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
  };
}

export interface DayForecast {
  date: string; // YYYY-MM-DD (norsk kalenderdag)
  tempMin: number;
  tempMax: number;
  windMax: number; // m/s
  precipMm: number;
  /** MET symbol_code, f.eks. "partlycloudy_day", "rain" */
  symbol: string;
}

const cache = new Map<string, { expires: number; data: MetTimeseries[] }>();

async function fetchTimeseries(lat: number, lon: number): Promise<MetTimeseries[]> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const url = `${MET_URL}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`Værtjenesten svarte ${resp.status}`);
  const body = (await resp.json()) as { properties?: { timeseries?: MetTimeseries[] } };
  const series = body.properties?.timeseries ?? [];
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: series });
  return series;
}

const osloDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const osloHourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  hour: "2-digit",
  hour12: false,
});

/**
 * Oppsummer værmeldingen for en norsk kalenderdag (dagtid 06–21):
 * temperaturspenn, maks vind, samlet nedbør og et representativt symbol
 * (nærmest kl. 12). Returnerer null når datoen er utenfor horisonten (~9 dager).
 */
export async function forecastForDay(
  lat: number,
  lon: number,
  dateISO: string
): Promise<DayForecast | null> {
  const series = await fetchTimeseries(lat, lon);
  const entries = series
    .map((e) => {
      const when = new Date(e.time);
      return { e, day: osloDayFmt.format(when), hour: Number(osloHourFmt.format(when)) };
    })
    .filter((x) => x.day === dateISO && x.hour >= 6 && x.hour <= 21);
  if (entries.length === 0) return null;

  let tempMin = Infinity;
  let tempMax = -Infinity;
  let windMax = 0;
  let precipMm = 0;
  let symbol = "";
  let symbolDist = Infinity;

  for (const { e, hour } of entries) {
    const det = e.data.instant.details;
    if (typeof det.air_temperature === "number") {
      tempMin = Math.min(tempMin, det.air_temperature);
      tempMax = Math.max(tempMax, det.air_temperature);
    }
    if (typeof det.wind_speed === "number") windMax = Math.max(windMax, det.wind_speed);

    const step = e.data.next_1_hours ?? e.data.next_6_hours;
    // Nedbør: 1-timesverdier summeres; lengre fram finnes bare 6-timers
    // (hver 6. time), så summen blir et rimelig døgnanslag begge veier.
    if (e.data.next_1_hours?.details?.precipitation_amount != null) {
      precipMm += e.data.next_1_hours.details.precipitation_amount;
    } else if (hour % 6 === 0 && e.data.next_6_hours?.details?.precipitation_amount != null) {
      precipMm += e.data.next_6_hours.details.precipitation_amount;
    }
    const sym = step?.summary?.symbol_code;
    if (sym && Math.abs(hour - 12) < symbolDist) {
      symbol = sym;
      symbolDist = Math.abs(hour - 12);
    }
  }
  if (!Number.isFinite(tempMin)) return null;

  return {
    date: dateISO,
    tempMin: Math.round(tempMin),
    tempMax: Math.round(tempMax),
    windMax: Math.round(windMax),
    precipMm: Math.round(precipMm * 10) / 10,
    symbol,
  };
}

/** Kort norsk væroppsummering til AI-kontekst (klokketips). */
export function describeForecast(f: DayForecast): string {
  const temp = f.tempMin === f.tempMax ? `${f.tempMin}°C` : `${f.tempMin}–${f.tempMax}°C`;
  const rain = f.precipMm >= 0.3 ? `, ${f.precipMm} mm nedbør` : ", opphold";
  const wind = f.windMax >= 8 ? `, mye vind (${f.windMax} m/s)` : f.windMax >= 4 ? `, litt vind (${f.windMax} m/s)` : "";
  return `${temp}${rain}${wind} (${f.symbol})`;
}
