/**
 * Engangs-migrering: retter høydedata på økter som ble importert FØR enhetsfeilen ble fikset.
 * Den gamle parseren lagret stigning og høyde i km (delt på 1000) pga. lengthUnit="km".
 *
 * Marker for "gammel" økt: strøm-punktene mangler feltet `distanceKm` (lagt til samtidig
 * som fiksen). Slike økter får:
 *   - elevationGainM   ×1000   (0.046 → 46 m)
 *   - stream.altitude  ×1000   (km → m)
 *   - stream.distanceKm rekonstruert fra tempo (sec/km) integrert over tid
 *
 * Kjør: npm -w server run fix:elevation
 */
import { prisma } from "../db.js";

interface OldPoint {
  t: number;
  hr?: number;
  paceSecPerKm?: number;
  altitude?: number;
  distanceKm?: number;
  cadence?: number;
}

async function main() {
  const workouts = await prisma.workout.findMany();
  let fixed = 0;

  for (const w of workouts) {
    const streams: OldPoint[] = w.streamsJson ? JSON.parse(w.streamsJson) : [];
    const alreadyNew = streams.length === 0 || streams.some((p) => p.distanceKm != null);
    if (alreadyNew) {
      continue; // allerede riktig format
    }

    // Rekonstruer kumulativ distanse fra tempo + tid, og konverter høyde til meter
    let cumKm = 0;
    for (let i = 0; i < streams.length; i++) {
      const p = streams[i];
      if (i > 0) {
        const dt = p.t - streams[i - 1].t; // sekunder
        const pace = streams[i - 1].paceSecPerKm; // sec/km
        if (dt > 0 && pace && pace > 0) cumKm += dt / pace;
      }
      p.distanceKm = Math.round(cumKm * 1000) / 1000;
      if (p.altitude != null) p.altitude = Math.round(p.altitude * 1000 * 10) / 10;
    }

    const newElev =
      w.elevationGainM != null ? Math.round(w.elevationGainM * 1000) : w.elevationGainM;

    await prisma.workout.update({
      where: { id: w.id },
      data: { elevationGainM: newElev, streamsJson: JSON.stringify(streams) },
    });
    console.log(
      `✓ Økt #${w.id} (${w.name ?? w.sport ?? "?"}): stigning ${w.elevationGainM} → ${newElev} m, ${streams.length} punkter`
    );
    fixed++;
  }

  console.log(`\nFerdig. Rettet ${fixed} av ${workouts.length} økter.`);
}

main()
  .catch((e) => {
    console.error("❌ FEIL:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
