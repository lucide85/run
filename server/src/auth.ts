import type { Request, Response, NextFunction } from "express";
import type { User } from "@prisma/client";
import { getUserByEmail, getUserById, getAdmin, verifyPassword } from "./services/users.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
  }
}

const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Sann hvis forespørselen kommer fra samme maskin (localhost). */
export function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || "";
  return LOCAL_IPS.has(ip);
}

/** Gate: localhost logges automatisk inn som admin; ellers kreves innlogget sesjon. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId && isLocalRequest(req)) {
    const admin = await getAdmin();
    if (admin) {
      req.session.userId = admin.id;
      req.session.role = admin.role;
    }
  }
  if (!req.session.userId) return res.status(401).json({ error: "Ikke innlogget" });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "admin") return res.status(403).json({ error: "Krever admin-tilgang" });
  next();
}

/** Hent innlogget bruker fra sesjonen (kaster hvis ikke funnet). */
export async function currentUser(req: Request): Promise<User> {
  const id = req.session.userId;
  if (!id) throw new Error("Ikke innlogget");
  const user = await getUserById(id);
  if (!user) throw new Error("Bruker finnes ikke");
  return user;
}

export function currentUserId(req: Request): number {
  if (!req.session.userId) throw new Error("Ikke innlogget");
  return req.session.userId;
}

export async function login(req: Request, res: Response) {
  const { username, password, email } = req.body ?? {};
  const loginId = (email ?? username ?? "").toString();
  const user = await getUserByEmail(loginId);
  if (user && verifyPassword(user, password)) {
    req.session.userId = user.id;
    req.session.role = user.role;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Feil brukernavn eller passord" });
}

export function logout(req: Request, res: Response) {
  req.session.destroy(() => res.json({ ok: true }));
}

/** Lett status-sjekk for frontend-gaten. */
export async function authStatus(req: Request, res: Response) {
  if (!req.session.userId && isLocalRequest(req)) {
    const admin = await getAdmin();
    if (admin) {
      req.session.userId = admin.id;
      req.session.role = admin.role;
    }
  }
  res.json({ authenticated: !!req.session.userId, local: isLocalRequest(req) });
}

/** Info om innlogget bruker (nickname, rolle, onboarding-status). */
export async function me(req: Request, res: Response) {
  const user = await currentUser(req);
  res.json({
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    mustOnboard: user.mustOnboard,
  });
}
