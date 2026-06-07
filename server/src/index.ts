import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
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

app.set("trust proxy", "loopback");
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(
  session({
    secret: cfg.server.sessionSecret || "treningsapp-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

// --- Auth-ruter (ubeskyttet) ---
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/status", authStatus);
app.get("/api/me", requireAuth, me);

// --- Beskyttede API-ruter ---
app.use("/api/plan", requireAuth, planRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/weight", requireAuth, weightRouter);
app.use("/api/workouts", requireAuth, workoutsRouter);
app.use("/api/sync", requireAuth, syncRouter);
app.use("/api/ai", requireAuth, aiRouter);
app.use("/api/onboarding", requireAuth, onboardingRouter);
app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

// --- Statisk frontend i produksjon ---
const clientDist = path.resolve(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const port = cfg.server.port || 3001;

async function start() {
  // Sikre admin-bruker + backfill gammel data, og seed admins program ved første oppstart
  const admin = await ensureAdminAndBackfill();
  const created = await seedProgram(admin.id);
  if (created > 0) console.log(`✅ Seedet ${created} planlagte økter for admin ved oppstart.`);

  // Rydd opp eldre koblede økter som feilaktig står som "moved"/"planned"
  const reconciled = await reconcileLinkedSessions();
  if (reconciled > 0) console.log(`✅ Forenet ${reconciled} koblede økter til "fullført" ved oppstart.`);

  app.listen(port, () => {
    console.log(`\n🏃 Treningsapp-server kjører på http://localhost:${port}`);
    console.log(`   Lokal tilgang slipper rett inn (uten innlogging).`);
  });
}

start();
