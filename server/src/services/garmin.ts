import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import AdmZip from "adm-zip";
import GarminConnectModule from "garmin-connect";
import type { GarminConnect } from "garmin-connect";
import type { User } from "@prisma/client";

// garmin-connect er en CommonJS-pakke – navngitte eksporter er ikke alltid synlige under
// ESM (avhenger av Node-versjonens cjs-module-lexer; feilet på Node 20 i Docker).
// Hent derfor konstruktøren defensivt fra modulobjektet.
const GarminConnectCtor: any =
  (GarminConnectModule as any)?.GarminConnect ?? (GarminConnectModule as any)?.default?.GarminConnect;
import { prisma } from "../db.js";
import { decrypt } from "../lib/crypto.js";
import { parseFit, type ParsedWorkout, type ZoneDef } from "./fit.js";
import {
  startGarminLogin,
  submitGarminMfa,
  type GarminTokens,
  type PendingMfa,
} from "./garminAuth.js";

// Én klient per bruker (cachet i minnet)
const clients = new Map<number, GarminConnect>();

// Mellomtilstand for to-faktor-innlogging (per bruker, kort levetid)
const pendingMfa = new Map<number, PendingMfa>();
const MFA_TTL_MS = 10 * 60 * 1000;

/** Lagre OAuth-tokens for en bruker og tøm cachet klient. */
async function saveTokens(userId: number, tokens: GarminTokens): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { garminSessionJson: JSON.stringify(tokens) },
  });
  clients.delete(userId);
}

/**
 * Start innlogging mot Garmin med e-post + passord. Returnerer `{ mfaRequired: true }`
 * hvis kontoen har to-faktor – kall da `completeGarminMfa` med koden brukeren mottar.
 */
export async function beginGarminLogin(
  userId: number,
  email: string,
  password: string
): Promise<{ mfaRequired: boolean }> {
  const result = await startGarminLogin(email, password);
  if (result.status === "ok") {
    pendingMfa.delete(userId);
    await saveTokens(userId, result.tokens);
    return { mfaRequired: false };
  }
  pendingMfa.set(userId, result.pending);
  return { mfaRequired: true };
}

/** Fullfør to-faktor-innlogging med sikkerhetskoden. */
export async function completeGarminMfa(userId: number, code: string): Promise<void> {
  const pending = pendingMfa.get(userId);
  if (!pending || Date.now() - pending.createdAt > MFA_TTL_MS) {
    pendingMfa.delete(userId);
    throw new Error("Innloggingsøkten utløp. Start innloggingen mot Garmin på nytt.");
  }
  const tokens = await submitGarminMfa(pending, code);
  pendingMfa.delete(userId);
  await saveTokens(userId, tokens);
}

/** Er det en MFA-innlogging som venter på kode for denne brukeren? */
export function hasPendingMfa(userId: number): boolean {
  const p = pendingMfa.get(userId);
  return !!p && Date.now() - p.createdAt <= MFA_TTL_MS;
}

function garminCreds(user: User): { email: string; password: string } {
  if (!user.garminEmail || !user.garminPasswordEnc) {
    throw new Error("Garmin-konto er ikke koblet. Legg inn Garmin-innlogging i Innstillinger.");
  }
  return { email: user.garminEmail, password: decrypt(user.garminPasswordEnc) };
}

/** Logger inn for en bruker (gjenbruker lagret sesjon hvis mulig). */
export async function getGarminClient(user: User): Promise<GarminConnect> {
  const cached = clients.get(user.id);
  if (cached) return cached;

  const { email, password } = garminCreds(user);
  const client = new GarminConnectCtor({ username: email, password });

  // Prøv lagret token-sesjon fra DB (settes ved innlogging, fornyes automatisk av biblioteket)
  if (user.garminSessionJson) {
    try {
      const saved = JSON.parse(user.garminSessionJson) as GarminTokens;
      client.loadToken(saved.oauth1, saved.oauth2);
      clients.set(user.id, client);
      return client;
    } catch {
      // faller gjennom til full innlogging
    }
  }

  // Ingen lagret sesjon – logg inn på nytt via vår egen SSO-flyt.
  const result = await startGarminLogin(email, password);
  if (result.status !== "ok") {
    throw new Error(
      "Garmin-kontoen krever to-faktor (MFA). Koble til Garmin på nytt i Innstillinger og skriv inn sikkerhetskoden."
    );
  }
  await saveTokens(user.id, result.tokens);
  client.loadToken(result.tokens.oauth1, result.tokens.oauth2);
  clients.set(user.id, client);
  return client;
}

export interface GarminActivitySummary {
  activityId: number | string;
  activityName?: string;
  startTimeLocal?: string;
  activityType?: { typeKey?: string };
  distance?: number;
  duration?: number;
}

export async function getRecentActivities(user: User, limit = 20): Promise<GarminActivitySummary[]> {
  const client = await getGarminClient(user);
  // @ts-ignore — getActivities(start, limit)
  const activities = await client.getActivities(0, limit);
  return activities as GarminActivitySummary[];
}

export async function downloadAndParse(
  user: User,
  activity: GarminActivitySummary,
  zones?: ZoneDef[]
): Promise<ParsedWorkout> {
  const client = await getGarminClient(user);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-"));
  try {
    // @ts-ignore — downloadOriginalActivityData(activity, dir)
    await client.downloadOriginalActivityData(activity, tmpDir);
    const fitBuffer = findFitBuffer(tmpDir);
    if (!fitBuffer) throw new Error("Fant ingen FIT-fil i nedlastet aktivitetsdata.");
    return await parseFit(fitBuffer, zones);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function findFitBuffer(dir: string): Buffer | null {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.toLowerCase().endsWith(".fit")) return fs.readFileSync(full);
    if (name.toLowerCase().endsWith(".zip")) {
      const zip = new AdmZip(full);
      const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".fit"));
      if (entry) return entry.getData();
    }
  }
  return null;
}

/**
 * Brukes av CLI-scriptet for engangs-innlogging for en gitt bruker. Hvis kontoen har
 * to-faktor blir `promptCode` kalt for å hente sikkerhetskoden interaktivt.
 */
export async function loginAndPersist(user: User, promptCode?: () => Promise<string>): Promise<void> {
  clients.delete(user.id);
  const { email, password } = garminCreds(user);
  const result = await startGarminLogin(email, password);
  if (result.status === "ok") {
    await saveTokens(user.id, result.tokens);
    return;
  }
  if (!promptCode) throw new Error("Kontoen krever en MFA-kode.");
  const code = await promptCode();
  const tokens = await submitGarminMfa(result.pending, code);
  await saveTokens(user.id, tokens);
}

/** Tøm cachet klient (f.eks. etter at brukeren endrer Garmin-innlogging). */
export function clearGarminClient(userId: number): void {
  clients.delete(userId);
}
