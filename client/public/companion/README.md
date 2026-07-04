# Treningskompis – figurbilder

Denne mappen inneholder figurene til Treningskompisen – en liten blob-skapning
som utvikler seg etter hvert som du fullfører økter i 10 km-programmet.

## Stegene

| Fil | Steg | Navn | Krav (fullførte økter) |
|---|---|---|---|
| `stage-0.svg` | 0 | Egget | 0–2 – rugger på seg, en liten sprekk viser at noe er på gang |
| `stage-1.svg` | 1 | Nøstet | 3–8 – nyklekket blob som titter opp av skallet |
| `stage-2.svg` | 2 | Joggelua | 9–17 – har fått små bein og oransje pannebånd |
| `stage-3.svg` | 3 | Løperen | 18–29 – høyere, med ekte joggesko og løpesteg |
| `stage-4.svg` | 4 | Raketten | 30–43 – strømlinjeformet, med kult visir og vindlinjer |
| `stage-5.svg` | 5 | Legenden | 44+ **eller** fullført løpsdag – gullmedalje og liten kappe |

Logikken bor i `client/src/lib/companion.ts` (`computeStage`, terskler i
`STAGE_THRESHOLDS`).

## Stilregler (hvis du tegner om SVG-ene)

- ~400×400 viewBox, selvstendig fil uten eksterne referanser
- Pseudo-3D: stor `radialGradient` på kroppen (lys øverst til venstre →
  mettet nederst til høyre), myk ellipse-bakkeskygge, hvite speilende
  høylys, subtil indre glød langs kanten
- Store blanke øyne: mørk iris (#22333B) med to hvite høylys
- Palett: app-turkis `#008094`-familien + varme aksenter (`#ff9f68`, krem)
- Samme øyestil og palett på alle steg, så figuren beholder identiteten

## AI-genererte 3D-bilder (WebP) — appen er allerede satt opp for dette

Appen foretrekker nå `stage-<n>.webp`. **Så lenge webp-filene ikke ligger her,
faller hvert bilde automatisk tilbake til `stage-<n>.svg`** (se
`handleStageImageError` i `client/src/lib/companion.ts`) – ingenting blir ødelagt
mens du jobber. Legg inn webp-ene når de er klare, så tar appen dem i bruk.

Slik lager du dem:

### 1. Generer figurene med denne prompten

> A character evolution lineup of 6 stages of the same adorable 3D cartoon
> blob creature, Pixar-style render, soft studio lighting, subtle subsurface
> scattering, on a plain solid light-gray background, all characters in a
> single horizontal row, evenly spaced, same scale reference. The character
> is a friendly round teal blob (main color #008094 with lighter aqua top)
> with huge glossy dark eyes with two white specular highlights, soft warm
> orange (#ff9f68) and cream accents. Stage 1: a cute pastel cream egg with
> teal and orange spots and a tiny crack, no eyes. Stage 2: a newly hatched
> blob peeking out of the bottom half of the eggshell, eggshell piece as a
> hat. Stage 3: round blob with two tiny stubby legs and an orange sports
> headband, happy open smile. Stage 4: taller athletic blob wearing white
> sneakers with orange details and the orange headband, mid-run pose.
> Stage 5: sleek aerodynamic blob leaning forward wearing a cool reflective
> visor, motion wind lines. Stage 6: majestic proud blob wearing a golden
> headband, a gold medal on a red ribbon and a tiny flowing orange cape,
> sparkles around it. Consistent character identity across all stages,
> cute, wholesome, high quality 3D render.

Tips: be modellen om **én figur per bilde** mot **ren, lys, ensfarget
bakgrunn** (ikke oppstilling), så blir automatisk beskjæring enklere. Vil du ha
alle seks i ett bilde, klipp dem fra hverandre først.

### 2. Konverter automatisk til ferdige WebP-er

1. Legg de genererte bildene i `client/scripts/companion-src/` og gi dem navn
   `stage-0`, `stage-1`, … `stage-5` (png/jpg/webp går fint), ett bilde per steg.
2. Kjør konverteringen (bruker `sharp`, som allerede er installert):

   ```bash
   npm -w client run companion:webp
   ```

   Scriptet trimmer bort ensfarget kant, sentrerer figuren i et kvadrat med litt
   luft, gjør bakgrunnen transparent og skriver `stage-<n>.webp` (~512×512) hit.
   Steg som mangler kildebilde hoppes over – de faller tilbake til SVG-en.
3. Bygg klienten på nytt så bildene havner i PWA-cachen:

   ```bash
   npm -w client run build
   ```

Det er alt. `COMPANION_IMAGE_EXT` står allerede på `"webp"`, og oversikten,
kompis-siden og utviklingsseremonien bruker alle `stageImageUrl()` – så alt
bytter bilde samtidig. SVG-ene blir liggende som reserve.

> **Bakgrunnsfjerning:** `sharp` sin `.trim()` fjerner en *ensfarget* kant, men
> gjør ikke en hvit bakgrunn *bak/rundt* figuren transparent. Genererer modellen
> allerede transparent PNG, er alt bra. Ellers: kjør bildene gjennom en
> bakgrunnsfjerner (f.eks. remove.bg eller Photoroom) før du legger dem i
> `companion-src/`.
