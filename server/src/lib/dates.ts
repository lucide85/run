/**
 * Kalenderdag-logikk forankret i norsk lokaltid (Europe/Oslo).
 * Appen lagrer plandatoer som kl. 12:00 UTC; en økt løpt 00:30 lørdag norsk
 * tid har UTC-dato fredag – uten denne konverteringen havner den på feil dag
 * i matching og fullført-dato.
 */

const osloFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function osloParts(d: Date): { y: number; m: number; day: number } {
  const [y, m, day] = osloFmt.format(d).split("-").map(Number);
  return { y, m, day };
}

/** Kl. 12:00 UTC på den norske kalenderdagen tidspunktet faller på (appens datokonvensjon). */
export function osloNoon(d: Date): Date {
  const { y, m, day } = osloParts(d);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

/** Millisekund-nøkkel (UTC-midnatt) for den norske kalenderdagen – til dagsdifferanser. */
export function osloDayKeyMs(d: Date): number {
  const { y, m, day } = osloParts(d);
  return Date.UTC(y, m - 1, day);
}
