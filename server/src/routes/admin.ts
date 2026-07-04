import { Router } from "express";
import { listUsers, createUser, deleteUser, resetPassword, getUserById, getUserByEmail } from "../services/users.js";
import { ah } from "../lib/http.js";

export const adminRouter = Router();

// Liste over alle brukere
adminRouter.get("/users", ah(async (_req, res) => {
  res.json(await listUsers());
}));

// Opprett ny bruker (genererer passord som vises én gang)
adminRouter.post("/users", ah(async (req, res) => {
  const { email, nickname } = req.body ?? {};
  if (!email || !nickname) return res.status(400).json({ error: "email og kallenavn kreves" });
  const existing = await getUserByEmail(email);
  if (existing) return res.status(409).json({ error: "E-posten er allerede registrert" });

  const { user, password } = await createUser(email, nickname);
  res.json({ id: user.id, email: user.email, nickname: user.nickname, password });
}));

// Generer nytt passord for en bruker (vises én gang)
adminRouter.post("/users/:id/reset-password", ah(async (req, res) => {
  const id = Number(req.params.id);
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: "Ikke funnet" });
  const password = await resetPassword(id);
  res.json({ password });
}));

// Slett en bruker (og all data via kaskade)
adminRouter.delete("/users/:id", ah(async (req, res) => {
  const id = Number(req.params.id);
  const user = await getUserById(id);
  if (!user) return res.status(404).json({ error: "Ikke funnet" });
  if (user.role === "admin") return res.status(400).json({ error: "Kan ikke slette admin-brukeren" });
  await deleteUser(id);
  res.json({ ok: true });
}));
