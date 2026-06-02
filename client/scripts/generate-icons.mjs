// Genererer PWA-ikoner (🏃 + 🏆) som PNG fra en håndtegnet SVG.
// Kjør: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
mkdirSync(publicDir, { recursive: true });

// padTight: liten luft (vanlig ikon). padSafe: maskable (innhold i midtre 80 %).
function svg({ rounded }) {
  const runner = `
    <g stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <!-- torso -->
      <line x1="206" y1="196" x2="244" y2="306"/>
      <!-- bakre arm -->
      <line x1="214" y1="214" x2="150" y2="246"/>
      <!-- fremre arm -->
      <polyline points="214,214 272,196 286,238"/>
      <!-- bakre ben -->
      <polyline points="244,306 196,356 156,352"/>
      <!-- fremre ben -->
      <polyline points="244,306 300,330 308,388"/>
    </g>
    <!-- hode -->
    <circle cx="206" cy="150" r="40" fill="#ffffff"/>`;

  const trophy = `
    <g transform="translate(330,300)">
      <g fill="#fbbf24" stroke="#f59e0b" stroke-width="4">
        <!-- skål -->
        <path d="M22 6 H102 V34 a40 40 0 0 1 -80 0 Z"/>
        <!-- hanker -->
        <path d="M22 10 H6 a16 16 0 0 0 16 26" fill="none" stroke-width="10"/>
        <path d="M102 10 H118 a16 16 0 0 1 -16 26" fill="none" stroke-width="10"/>
        <!-- stilk -->
        <rect x="56" y="70" width="12" height="22"/>
        <!-- fot -->
        <rect x="36" y="92" width="52" height="14" rx="4"/>
      </g>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#34d399"/>
        <stop offset="1" stop-color="#0ea5e9"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="512" height="512" rx="${rounded}" fill="url(#bg)"/>
    ${runner}
    ${trophy}
  </svg>`;
}

const targets = [
  { file: "pwa-192x192.png", size: 192, rounded: 96 },
  { file: "pwa-512x512.png", size: 512, rounded: 96 },
  { file: "maskable-512x512.png", size: 512, rounded: 0 },
  { file: "apple-touch-icon.png", size: 180, rounded: 0 },
  { file: "favicon-32x32.png", size: 32, rounded: 8 },
];

for (const t of targets) {
  const buf = Buffer.from(svg({ rounded: t.rounded }));
  await sharp(buf).resize(t.size, t.size).png().toFile(resolve(publicDir, t.file));
  console.log("✓", t.file);
}

// Behold også en SVG-favicon
writeFileSync(resolve(publicDir, "favicon.svg"), svg({ rounded: 96 }));
console.log("✓ favicon.svg");
console.log("Ferdig – ikoner i", publicDir);
