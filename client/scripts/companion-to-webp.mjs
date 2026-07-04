#!/usr/bin/env node
/**
 * Gjør AI-genererte figur-bilder om til ferdige webp-er for treningskompisen.
 *
 * Legg kildebildene i client/scripts/companion-src/ som stage-0 … stage-5
 * (png/jpg/jpeg/webp – navnet må starte med "stage-<n>"). Kjør så:
 *
 *   node client/scripts/companion-to-webp.mjs
 *
 * Scriptet trimmer bort ensfarget/gjennomsiktig kant, passer bildet inn i et
 * kvadrat med litt luft, og skriver client/public/companion/stage-<n>.webp
 * (transparent bakgrunn, ~512×512). SVG-ene beholdes som reserve.
 *
 * Krever "sharp" (allerede en dev-avhengighet i client/).
 */
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "companion-src");
const OUT_DIR = path.resolve(__dirname, "..", "public", "companion");
const SIZE = 512;

if (!existsSync(SRC_DIR)) {
  console.error(
    `Fant ingen kildemappe: ${SRC_DIR}\n` +
      `Lag den og legg inn stage-0 … stage-5 (png/jpg/webp), og kjør på nytt.`
  );
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR).filter((f) => /^stage-[0-5]\.(png|jpe?g|webp)$/i.test(f));
if (files.length === 0) {
  console.error(`Ingen filer som matcher stage-<0-5>.(png|jpg|webp) i ${SRC_DIR}`);
  process.exit(1);
}

let done = 0;
for (let stage = 0; stage <= 5; stage++) {
  const match = files.find((f) => f.toLowerCase().startsWith(`stage-${stage}.`));
  if (!match) {
    console.warn(`⚠️  Mangler kildebilde for steg ${stage} – hopper over (SVG-en brukes som reserve).`);
    continue;
  }
  const inPath = path.join(SRC_DIR, match);
  const outPath = path.join(OUT_DIR, `stage-${stage}.webp`);
  try {
    await sharp(inPath)
      .trim() // fjern ensfarget kant (typisk hvit/transparent bakgrunn)
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, effort: 5 })
      .toFile(outPath);
    console.log(`✅ Steg ${stage}: ${match} → public/companion/stage-${stage}.webp`);
    done++;
  } catch (e) {
    console.error(`❌ Steg ${stage} feilet (${match}): ${e.message}`);
  }
}

console.log(
  `\nFerdig: ${done}/6 webp-er skrevet.` +
    (done < 6 ? " Manglende steg faller tilbake til SVG automatisk i appen." : "") +
    `\nHusk å bygge klienten på nytt (npm -w client run build) så de kommer med i PWA-cachen.`
);
