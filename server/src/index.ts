import express from "express";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "./config.js";
import { prisma, initDb } from "./db.js";
import { ah } from "./lib/http.js";
import { requireAuth, requireAdmin, login, logout, authStatus, me } from "./auth.js";
import { seedProgram, reconcileLinkedSessions } from "./services/plan.js";
import { ensureAdminAndBackfill } from "./services/users.js";
import { planRouter } from "./routes/plan.js";
import { settingsRouter } from "./routes/settings.js";
import { weightRouter } from "./routes/weight.js";
import { workoutsRouter } from "./routes/workouts.js";
import { syncRouter } from "./routes/sync.js";
import { aiRouter } from "./routes/ai.js";
import { adminRouter } from "./routes/admin.js";
import { onboardingRouter } from "./routes/onboarding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const app = express();

// Varsle tydelig hvis hemmeligheter mangler eller står på eksempelverdiene.
// (Bevisst kun varsel – å nekte oppstart kunne stoppe en kjørende produksjon.)
function warnAboutSecrets(c: AppConfig): void {
  const check = (value: string | undefined, name: string) => {
    if (!value || value.length < 16 || value.startsWith("bytt-meg")) {
      console.warn(
        `⚠️  ${name} er tom, for kort eller står på eksempelverdien – sett en lang tilfeldig streng i config.json!`
      );
    }
  };
  check(c.server.sessionSecret, "server.sessionSecret");
  check(c.server.encryptionKey, "server.encryptionKey (krypterer lagrede Garmin-passord)");
}
warnAboutSecrets(cfg);

// Stol kun på loopback som proxy – pluss ev. eksplisitt oppgitte proxy-IP-er
// (f.eks. Traefik-VM-en) i config.server.trustedProxies. Uten dette deler alle
// eksterne brukere samme "IP" (Traefik-VM-ens) i f.eks. rate-limiting.
const trustedProxies: string[] = Array.isArray(cfg.server.trustedProxies)
  ? cfg.server.trustedProxies.filter((x): x is string => typeof x === "string" && x.length > 0)
  : [];
app.set("trust proxy", ["loopback", ...trustedProxies]);

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// Helsesjekk FØR sesjons-middleware: Docker-helsesjekken skal ikke opprette
// en ny (admin-)sesjon hvert 30. sekund.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Sesjoner lagres som filer på datavolumet – innloggingene overlever
// omstart/oppdatering av containeren (i motsetning til MemoryStore).
const FileStore = FileStoreFactory(session);
const sessionsDir = path.resolve(__dirname, "..", "prisma", "data", "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });
app.use(
  session({
    store: new FileStore({
      path: sessionsDir,
      ttl: 60 * 60 * 24 * 30, // sekunder – matcher cookie-levetiden
      retries: 0,
      logFn: () => {}, // session-file-store er ellers svært pratsom
    }),
    secret: cfg.server.sessionSecret || "treningsapp-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

// Innlogging er eksponert mot internett: brems brute force. Merk at uten
// trustedProxies deler alle eksterne klienter én bøtte (Traefik-VM-ens IP) –
// skipSuccessfulRequests gjør at vellykkede innlogginger ikke teller.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "For mange innloggingsforsøk. Prøv igjen om et kvarter." },
});

// --- Auth-ruter (ubeskyttet) ---
app.post("/api/auth/login", loginLimiter, ah(login));
app.post("/api/auth/logout", logout);
app.get("/api/auth/status", ah(authStatus));
app.get("/api/me", ah(requireAuth), ah(me));

// --- Beskyttede API-ruter ---
app.use("/api/plan", ah(requireAuth), planRouter);
app.use("/api/settings", ah(requireAuth), settingsRouter);
app.use("/api/weight", ah(requireAuth), weightRouter);
app.use("/api/workouts", ah(requireAuth), workoutsRouter);
app.use("/api/sync", ah(requireAuth), syncRouter);
app.use("/api/ai", ah(requireAuth), aiRouter);
app.use("/api/onboarding", ah(requireAuth), onboardingRouter);
app.use("/api/admin", ah(requireAuth), requireAdmin, adminRouter);

// --- Statisk frontend i produksjon ---
const clientDist = path.resolve(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Sentral feilhåndtering: async-feil fra ah() lander her i stedet for å ta
// ned prosessen (Express 4 fanger ikke avviste promises selv).
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Uventet feil:", err);
  if (res.headersSent) return next(err as Error);
  res.status(500).json({ error: "Uventet serverfeil" });
});

// Absolutt siste skanse: logg i stedet for å la Node avslutte prosessen.
process.on("unhandledRejection", (reason) => {
  console.error("Uhåndtert promise-avvisning:", reason);
});

const port = cfg.server.port || 3001;

async function start() {
  await initDb();

  // Sikre admin-bruker + backfill gammel data, og seed admins program ved første oppstart
  const admin = await ensureAdminAndBackfill();
  const created = await seedProgram(admin.id);
  if (created > 0) console.log(`✅ Seedet ${created} planlagte økter for admin ved oppstart.`);

  // Rydd opp eldre koblede økter som feilaktig står som "moved"/"planned"
  const reconciled = await reconcileLinkedSessions();
  if (reconciled > 0) console.log(`✅ Forenet ${reconciled} koblede økter til "fullført" ved oppstart.`);

  const server = app.listen(port, () => {
    console.log(`\n🏃 Treningsapp-server kjører på http://localhost:${port}`);
    console.log(`   Lokal tilgang slipper rett inn (uten innlogging).`);
  });

  // Ryddig nedstenging: uten dette henger `docker stop` i hele fristen og
  // avslutter med SIGKILL midt i eventuelle skriveoperasjoner.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      console.log(`\n⏹  Mottok ${sig} – avslutter…`);
      server.close(() => {
        prisma.$disconnect().finally(() => process.exit(0));
      });
      // Ikke vent evig på åpne tilkoblinger
      setTimeout(() => process.exit(0), 8000).unref();
    });
  }
}

start();
