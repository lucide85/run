# Treningsapp – 10 km 🏃

En self-hostet webapp som hjelper deg å følge ditt 17-ukers 10 km-program, importere
treningsøkter automatisk fra Garmin Connect, få AI-vurdering (Claude) av hver økt, stille
oppfølgingsspørsmål, og la AI tilpasse programmet fram mot løpsdagen **1. oktober 2026**.

- 📋 Hele programmet seedes automatisk (17 uker × 3 økter)
- 📅 Dra-og-slipp-kalender (Google Calendar-synk kommer som eget trinn)
- 👟 Auto-synk fra Garmin (puls, fart, splits, høyde, kadens) via FIT-parsing
- 🗑️ Slett irrelevante økter – de synkroniseres ikke inn igjen senere
- ✨ Claude vurderer øktene, svarer på oppfølgingsspørsmål og foreslår planjusteringer
- 📈 Grafer og tabeller for tempo, volum, puls-effektivitet og vekt
- 🏃 **Intervall-analyse**: drag og pauser gjenkjennes (FIT-intensitet eller heuristikk),
  og AI-en vurderer dragene – ikke snittpulsen for hele økten
- 🐣 **Treningskompis**: en søt figur som utvikler seg gjennom 6 steg etter hvert som du
  fullfører økter (egen side under «Kompis», feiring ved hver utvikling)
- 🔐 Innlogging fra config-fil, men fri tilgang når du sitter lokalt
- 📱 Lyst, moderne og mobilvennlig – **installerbar som app (PWA)** på mobil

---

## Forutsetning: installer Node.js

Appen krever **Node.js 20 eller nyere** (inkluderer `npm`). Last ned fra
<https://nodejs.org/> (LTS) og installer. Sjekk i et nytt terminalvindu:

```powershell
node -v
npm -v
```

> Maskinen denne ble bygget på hadde ikke Node installert – derfor er ikke avhengigheter
> installert ennå. Etter at Node er på plass, kjør stegene under.

## Oppsett (én gang)

```powershell
# 1. Lag config-filen og fyll inn dine verdier
copy config.example.json config.json
notepad config.json

# 2. Installer alt, opprett databasen og seed programmet
npm run setup
```

Fyll inn i `config.json`:

| Felt | Hva |
|---|---|
| `auth.username` / `auth.password` | Innlogging til selve appen (ikke nødvendig lokalt) |
| `garmin.email` / `garmin.password` | Din Garmin Connect-konto |
| `anthropic.apiKey` | API-nøkkel fra <https://console.anthropic.com> |
| `training.days` | Dine tre faste treningsdager (kan også endres i appen) |
| `auth.nickname` | Ditt kallenavn → tittelen «Run \<kallenavn\>, run!» (standard «Assi») |
| `server.encryptionKey` | Lang tilfeldig streng – krypterer lagrede Garmin-passord |

## Garmin-innlogging (én gang – spesielt ved to-faktor)

```powershell
npm run garmin:login
```

Har kontoen din to-faktor (MFA), taster du inn engangskoden når du blir bedt om det.
Sesjonen lagres i `server/.garmin-session.json` og gjenbrukes ved synk.

## Kjøre appen

```powershell
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend-API: <http://localhost:3001>

Siden du kjører lokalt, slipper du rett inn uten innlogging. Når appen kjøres på en server
og nås utenfra, kreves brukernavn/passord fra `config.json`.

### Produksjon (uten Docker)

```powershell
npm run build   # bygger frontend + backend
npm start       # serverer alt fra http://localhost:3001
```

---

## Publisering hjemme med Docker + Traefik

Denne oppskriften gjelder oppsettet: **appen kjører som Docker-container på én VM**, og
**Traefik kjører på en annen VM** og ruter trafikk fra ditt domene inn til appen over HTTPS.
I produksjon serverer appen alt (API + frontend) fra **én port: `3001`**.

Begrep: «**app-VM**» = maskinen der containeren kjører. «**Traefik-VM**» = maskinen der Traefik kjører.

### Oversikt over trafikkflyten

```
Internett → ruter (port 80/443) → Traefik-VM → http://<APP_VM_IP>:3001 → container
   DNS: run.dittdomene.no ─────────┘            (Traefik håndterer TLS/Let's Encrypt)
```

### Steg 1 – DNS og brannmur/port-forwarding

1. Opprett en **A-record** hos domeneleverandøren din:
   `run.dittdomene.no` → din **offentlige IP**. (Har du dynamisk IP hjemme, bruk DDNS.)
2. På hjemmeruteren: **videresend port 80 og 443** til **Traefik-VM-ens** lokale IP.
   (Port 80 trengs for Let's Encrypt HTTP-challenge og HTTP→HTTPS-redirect.)
3. På **app-VM-en**: tillat innkommende **port 3001** fra Traefik-VM-en
   (f.eks. `sudo ufw allow from <TRAEFIK_VM_IP> to any port 3001`).

### Steg 2 – Sett opp appen på app-VM-en

Krever Docker + Docker Compose-plugin (`docker compose version`).

```bash
# 1. Hent koden
git clone <repo-url> treningsapp && cd treningsapp

# 2. Lag config-fila og fyll inn verdiene dine
cp config.example.json config.json
nano config.json
```

Viktige felt i `config.json` (se også tabellen lenger oppe):

| Felt | Verdi i produksjon |
|---|---|
| `auth.username` / `auth.password` | Admin-innlogging (brukes når du IKKE er på app-VM-en) |
| `auth.nickname` | Ditt kallenavn → «Run \<kallenavn\>, run!» |
| `anthropic.apiKey` | Din Claude-nøkkel |
| `server.port` | **3001** (må stemme med Compose/Traefik) |
| `server.sessionSecret` | Lang tilfeldig streng |
| `server.encryptionKey` | Lang tilfeldig streng (krypterer Garmin-passord i DB) |

```bash
# 3. Bygg og start containeren (kjører i bakgrunnen, starter automatisk ved boot)
docker compose up -d --build

# 4. Sjekk at den er oppe
docker compose logs -f         # skal vise «🏃 Treningsapp-server kjører …»
curl -I http://localhost:3001  # skal svare 200/302
```

Databasen (SQLite) lagres på Docker-volumet `treningsapp-data` og overlever omstart og
oppdatering. Skjemaet håndteres av **Prisma Migrate** (`prisma migrate deploy` i
`docker-entrypoint.sh`): ved hver oppstart tas først en **automatisk sikkerhetskopi**
(`backup-<tidspunkt>.db`, de 7 nyeste beholdes på volumet), en eksisterende database
baselines automatisk, og ventende migreringer kjøres. En destruktiv skjemaendring vil
**feile høyt** i stedet for å slette data i det stille.

### Steg 3 – Finn detaljene i din Traefik (siden du er usikker)

På Traefik-VM-en, åpne den **statiske** konfigurasjonen (ofte `traefik.yml`/`traefik.toml`
eller `--`-flagg i Traefiks `docker-compose.yml`). Du leter etter tre ting:

- **HTTPS-entrypoint:** navnet på entrypointet på port 443 (veldig ofte `websecure`).
  Se etter `entryPoints: websecure: address: ":443"`.
- **Certificate resolver:** navnet på Let's Encrypt-resolveren (ofte `letsencrypt` eller `le`).
  Se etter `certificatesResolvers: <navn>: acme: …`.
- **File provider-mappe:** mappa Traefik leser dynamiske filer fra. Se etter
  `providers: file: directory: /etc/traefik/dynamic` (og gjerne `watch: true`).
  Finnes ikke `providers.file`? Legg til i statisk config:
  ```yaml
  providers:
    file:
      directory: /etc/traefik/dynamic
      watch: true
  ```
  og opprett mappa, så restart Traefik én gang.

> Docker-labels (som mange Traefik-guider bruker) fungerer **ikke** her, fordi de bare
> oppdager containere på **samme** host som Traefik. Når Traefik står på en egen VM bruker
> man **file provider** slik som under.

### Steg 4 – Rut domenet til appen (på Traefik-VM-en)

Kopier `deploy/traefik/treningsapp.yml` (ligger i dette repoet) til Traefiks dynamiske mappe,
f.eks. `/etc/traefik/dynamic/treningsapp.yml`, og tilpass fire verdier:

```yaml
http:
  routers:
    treningsapp:
      rule: "Host(`run.dittdomene.no`)"     # ← ditt domene
      entryPoints:
        - websecure                          # ← navnet på HTTPS-entrypointet ditt
      service: treningsapp-svc
      tls:
        certResolver: letsencrypt            # ← navnet på din cert-resolver
  services:
    treningsapp-svc:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://192.168.1.50:3001"  # ← IP-en til APP-VM-en
```

Med `watch: true` plukkes fila opp umiddelbart – ellers restart Traefik
(`docker restart traefik` eller `sudo systemctl restart traefik`).

### Steg 5 – Verifiser

1. Åpne `https://run.dittdomene.no` – du skal få gyldig sertifikat (hengelås) og innloggingssiden.
2. Logg inn med `auth.username` / `auth.password` fra `config.json`.
3. Installer som app på mobil (se «Installer på mobil (PWA)» under).

### Oppdatere appen senere

```bash
cd treningsapp
git pull
docker compose up -d --build   # bygger nytt image og bytter container; data beholdes
```

### Driftsnotater

- **Localhost-bypass gjelder kun på app-VM-en selv.** All trafikk via Traefik kommer utenfra
  og krever derfor innlogging – akkurat som ønsket. Sekundærbrukere kan nå logge inn herfra.
- **Innlogginger overlever omstart.** Sesjoner lagres som filer på datavolumet
  (`sessions/`-mappa) – ingen re-innlogging etter oppdatering.
- **Innloggingsforsøk er rate-begrenset** (20 per kvarter). Vil du at begrensningen (og
  logger) skal se den EKTE klient-IP-en bak Traefik, legg Traefik-VM-ens IP i
  `server.trustedProxies` i `config.json` (f.eks. `["192.168.1.x"]`).
- **Backup:** containeren tar automatisk en konsistent kopi av databasen på volumet ved
  hver oppstart/oppdatering (7 siste beholdes). Ta i tillegg jevnlig kopi UT av VM-en, f.eks.
  daglig cron: `docker run --rm -v treningsapp-data:/d -v /home/<bruker>/backup:/b alpine cp /d/treningsapp.db /b/treningsapp-$(date +\%F).db`
  (kjør helst mens appen er rolig, eller stopp containeren først for garantert konsistens).
  Ta også vare på `config.json`.
- **HTTPS** håndteres 100 % av Traefik; containeren snakker ren HTTP internt på 3001.

### Etter oppgradering til intervall-analysen (engangs)

AI-vurderingen forstår nå drag/pauser i intervalløkter i stedet for å dømme økten på
snittpulsen. For å få **oppdatert vurdering på allerede gjennomførte intervalløkter**:

```bash
docker compose exec treningsapp node server/dist/scripts/refreshIntervalFeedback.js
```

(Lokalt: `npm -w server run refresh:interval-feedback`. Legg til `-- --dry-run` for å se
hva som ville blitt oppdatert først.) Gammel vurdering beholdes i historikken; den nye
legges til under, merket «🔁 Oppdatert vurdering med intervallanalyse». Scriptet er trygt
å kjøre flere ganger – allerede oppdaterte økter hoppes over. Merk: bruker Claude-API-et
(én vurdering per intervalløkt).

---

## Prosjektstruktur

```
server/   Express + Prisma (SQLite) + Garmin/FIT/Claude-tjenester
  src/data/program.ts      Hele treningsprogrammet
  src/services/            garmin · fit · ai · plan · sync
  src/routes/              plan · workouts · sync · ai · settings · weight
client/   React + Vite + Tailwind + Recharts + FullCalendar
  src/pages/               Dashboard · Kalender · Program · Økter · Progresjon · Innstillinger
config.json                Hemmeligheter (ikke i git)
```

Databasen er en enkelt SQLite-fil: `server/prisma/treningsapp.db`.

## Nyttige kommandoer

| Kommando | Hva |
|---|---|
| `npm run dev` | Kjør frontend + backend i utviklingsmodus |
| `npm run db:push` | Opprett/oppdater databaseskjema (dev; feiler ved destruktive endringer) |
| `npm -w server run db:migrate` | Kjør ventende migreringer (som i produksjon) |
| `npm -w server run refresh:interval-feedback` | Regenerer AI-vurdering for gamle intervalløkter |
| `npm run seed` | Seed programmet (`-- --force` for å regenerere) |
| `npm run garmin:login` | Logg inn mot Garmin (håndterer MFA) |
| `npm -w server run db:studio` | Åpne Prisma Studio for å se data |
| `npm -w server run fix:elevation` | Engangs: retter høydedata på økter importert før enhetsfiksen |

## Flere brukere

- **Admin** (deg) logger inn med `auth`-feltene fra `config.json`, og slipper rett inn lokalt.
- Under **Brukere** (kun synlig for admin) oppretter du nye brukere med e-post + kallenavn.
  Passordet **genereres og vises én gang** – del det med brukeren.
- En ny bruker logger inn med e-post + passord, kobler sin egen Garmin-konto under
  **Innstillinger**, og får en **AI-generert treningsplan** via en kort onboarding-veiviser.
- All data er **isolert per bruker** – ingen ser andres økter, heller ikke admin.
- Tittelen blir per bruker: **«Run \<kallenavn\>, run!»**.

> På samme maskin som serveren (localhost) logges du alltid inn som admin. For å teste eller
> bruke en sekundærkonto må du åpne appen fra en annen enhet/nettleser mot serverens adresse.

## Installer på mobil (PWA)

Appen er en **Progressive Web App** – den kan installeres på hjemskjermen og kjøres som
en frittstående app (uten nettleser-adressefelt), med eget ikon (🏃 mot 🏆).

1. Åpne appen i nettleseren på mobilen mot serverens adresse.
2. **iPhone (Safari):** Del-knappen → «Legg til på Hjem-skjerm».
   **Android (Chrome):** menyen ⋮ → «Installer app» / «Legg til på startskjerm».
3. Appen får ikon på hjemskjermen og åpnes i fullskjerm.

> **HTTPS kreves utenfor localhost.** Installasjon og service worker fungerer på `localhost`,
> men når appen nås fra en annen enhet må serveren betjenes over **HTTPS** (f.eks. bak en
> reverse proxy med Let's Encrypt) for at «Installer app» skal tilbys.

Et offline-skall caches automatisk (du kan åpne appen uten nett), men live Garmin-synk og
AI-kall krever selvsagt nettforbindelse. Ikoner regenereres ved behov med
`node client/scripts/generate-icons.mjs`.

## Status og forbehold

- **Trinn 1–6 er bygget** (skjelett, program, kalender, Garmin+FIT, progresjon, AI).
  **Trinn 7 (Google Calendar-synk)** gjenstår og bygges som egen runde – den krever at du
  oppretter et Google Cloud-prosjekt med OAuth-nøkler.
- **Garmin bruker et uoffisielt API.** `server/src/services/garmin.ts` kan trenge en liten
  justering mot den faktiske versjonen av `garmin-connect` som installeres (metodenavn for
  token-lagring/nedlasting har variert mellom versjoner). Dette bør verifiseres ved første
  kjøring mot din konto.
- **AI-kall koster tokens.** Programkontekst caches (prompt caching) for å holde kostnaden nede.
