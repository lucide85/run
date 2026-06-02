import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppConfig {
  auth: { username: string; password: string; nickname: string };
  garmin: { email: string; password: string };
  anthropic: { apiKey: string; model: string };
  race: { name: string; date: string };
  training: {
    startDate: string;
    days: string[];
    maxHr: number;
    restHr: number;
  };
  server: { port: number; sessionSecret: string; encryptionKey: string };
  google: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    calendarId: string;
  };
}

// config.json ligger i prosjektroten (to nivåer over server/src)
const CONFIG_PATH = path.resolve(__dirname, "..", "..", "config.json");
const EXAMPLE_PATH = path.resolve(__dirname, "..", "..", "config.example.json");

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(
      `\n⚠️  Fant ikke config.json på ${CONFIG_PATH}.\n` +
        `   Kopier config.example.json til config.json og fyll inn verdiene dine.\n` +
        `   Bruker eksempelverdier inntil videre (innlogging og integrasjoner vil ikke fungere).\n`
    );
    const example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, "utf-8")) as AppConfig;
    cached = example;
    return example;
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  cached = JSON.parse(raw) as AppConfig;
  return cached;
}

export function hasRealConfig(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export const SERVER_DIR = path.resolve(__dirname, "..");
export const GARMIN_SESSION_PATH = path.join(SERVER_DIR, ".garmin-session.json");
