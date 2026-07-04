import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { loadConfig } from "../config.js";
import { encrypt, generatePassword } from "../lib/crypto.js";

/** Sikrer at admin-brukeren finnes (fra config) og backfiller gammel data uten userId. */
export async function ensureAdminAndBackfill(): Promise<User> {
  const cfg = loadConfig();
  const email = cfg.auth.username.trim().toLowerCase();
  const nickname = cfg.auth.nickname || "Assi";
  const passwordHash = bcrypt.hashSync(cfg.auth.password, 10);

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash,
        role: "admin",
        mustOnboard: false, // admin har allerede det seedede programmet
        maxHr: cfg.training.maxHr,
        restHr: cfg.training.restHr,
        raceName: cfg.race.name,
        raceDate: cfg.race.date ? new Date(cfg.race.date) : null,
        trainingDaysJson: JSON.stringify(cfg.training.days),
        garminEmail: cfg.garmin?.email || null,
        garminPasswordEnc: cfg.garmin?.password ? encrypt(cfg.garmin.password) : null,
      },
    });
  } else {
    // Hold passord/kallenavn i synk med config
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash, nickname, role: "admin" },
    });
  }

  // Backfill: knytt all eksisterende data uten eier til admin
  const backfill = { where: { userId: null }, data: { userId: admin.id } };
  await prisma.plannedSession.updateMany(backfill);
  await prisma.workout.updateMany(backfill);
  await prisma.weightLog.updateMany(backfill);
  await prisma.planChange.updateMany(backfill);

  return admin;
}

export async function createUser(email: string, nickname: string): Promise<{ user: User; password: string }> {
  const password = generatePassword();
  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      nickname: nickname.trim(),
      passwordHash: bcrypt.hashSync(password, 10),
      role: "user",
      mustOnboard: true,
    },
  });
  return { user, password };
}

export async function resetPassword(userId: number): Promise<string> {
  const password = generatePassword();
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
  return password;
}

export function verifyPassword(user: User, plain: string): boolean {
  if (typeof plain !== "string" || !plain) return false;
  return bcrypt.compareSync(plain, user.passwordHash);
}

// Fast hash brukt for å utligne svartid når e-posten ikke finnes
// (ellers avslører responstiden hvilke kontoer som eksisterer).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

export function verifyDummyPassword(plain: string): void {
  try {
    bcrypt.compareSync(plain, DUMMY_HASH);
  } catch {
    /* kun for timing */
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}

export async function getUserById(id: number): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function getAdmin(): Promise<User | null> {
  return prisma.user.findFirst({ where: { role: "admin" } });
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, nickname: true, role: true, mustOnboard: true, createdAt: true, lastGarminSync: true },
  });
}

export async function deleteUser(id: number): Promise<void> {
  await prisma.user.delete({ where: { id } });
}
