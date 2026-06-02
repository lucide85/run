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
import { parseFit, type ParsedWorkout } from "./fit.js";

// Én klient per bruker (cachet i minnet)
const clients = new Map<number, GarminConnect>();

function garminCreds(user: User): { email: string; password: string } {
  if (!user.garminEmail || !user.garminPasswordEnc) {
    throw new Error("Garmin-konto er ikke koblet. Legg inn Garmin-innlogging i Innstillinger.");
  }
  return { email: user.garminEmail, password: decrypt(user.garminPasswordEnc) };
}

/** Logger inn for en bruker (gjenbruker lagret sesjon hvis mulig). */
export async function getGarminClient(user: User, mfaCode?: string): Promise<GarminConnect> {
  const cached = clients.get(user.id);
  if (cached) return cached;

  const { email, password } = garminCreds(user);
  const client = new GarminConnectCtor({ username: email, password });

  // Prøv lagret token-sesjon fra DB
  if (user.garminSessionJson) {
    try {
      const saved = JSON.parse(user.garminSessionJson);
      // @ts-ignore — API varierer mellom versjoner
      client.loadToken(saved.oauth1, saved.oauth2);
      clients.set(user.id, client);
      return client;
    } catch {
      // faller gjennom til full innlogging
    }
  }

  try {
    if (mfaCode) {
      // @ts-ignore — noen versjoner støtter MFA-callback
      await client.login(email, password, async () => mfaCode);
    } else {
      await client.login();
    }
  } catch (e) {
    throw new Error(
      `Innlogging mot Garmin feilet: ${(e as Error).message}. ` +
        `Hvis kontoen har to-faktor, må den foreløpig settes opp via admin-CLI (npm run garmin:login).`
    );
  }

  await persistSession(user.id, client);
  clients.set(user.id, client);
  return client;
}

async function persistSession(userId: number, client: GarminConnect): Promise<void> {
  try {
    // @ts-ignore — exportToken() finnes i nyere versjoner
    const token = client.exportToken?.();
    if (token) {
      await prisma.user.update({ where: { id: userId }, data: { garminSessionJson: JSON.stringify(token) } });
    }
  } catch {
    // ignorer — logger inn på nytt neste gang
  }
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

export async function downloadAndParse(user: User, activity: GarminActivitySummary): Promise<ParsedWorkout> {
  const client = await getGarminClient(user);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-"));
  try {
    // @ts-ignore — downloadOriginalActivityData(activity, dir)
    await client.downloadOriginalActivityData(activity, tmpDir);
    const fitBuffer = findFitBuffer(tmpDir);
    if (!fitBuffer) throw new Error("Fant ingen FIT-fil i nedlastet aktivitetsdata.");
    return await parseFit(fitBuffer);
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

/** Brukes av CLI-scriptet for engangs-innlogging (ev. med MFA) for en gitt bruker. */
export async function loginAndPersist(user: User, mfaCode?: string): Promise<void> {
  clients.delete(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { garminSessionJson: null } });
  await getGarminClient(user, mfaCode);
}

/** Tøm cachet klient (f.eks. etter at brukeren endrer Garmin-innlogging). */
export function clearGarminClient(userId: number): void {
  clients.delete(userId);
}
