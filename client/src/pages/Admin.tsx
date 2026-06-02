import { useEffect, useState } from "react";
import { api, AdminUser } from "../api/client";
import { Card, PageTitle, Button, Spinner } from "../components/ui";
import { dateNo } from "../lib/format";

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCred, setNewCred] = useState<{ email: string; nickname: string; password: string } | null>(null);

  async function load() {
    setUsers(await api.adminUsers());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function addUser() {
    setError("");
    if (!email || !nickname) {
      setError("Fyll inn e-post og kallenavn.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.adminCreateUser(email, nickname);
      setNewCred(r);
      setEmail("");
      setNickname("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPw(id: number, em: string) {
    if (!confirm(`Generere nytt passord for ${em}?`)) return;
    const r = await api.adminResetPassword(id);
    setNewCred({ email: em, nickname: "", password: r.password });
  }

  async function remove(id: number, em: string) {
    if (!confirm(`Slette ${em} og all deres data? Dette kan ikke angres.`)) return;
    await api.adminDeleteUser(id);
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <PageTitle title="Brukere" subtitle="Administrer hvem som har tilgang" />

      {newCred && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50/50">
          <h3 className="font-semibold text-slate-700">Passord generert ✅</h3>
          <p className="mt-1 text-sm text-slate-600">
            Del dette med <strong>{newCred.email}</strong>. Det vises bare denne ene gangen:
          </p>
          <div className="mt-3 flex items-center gap-3">
            <code className="rounded-lg bg-white px-4 py-2 text-lg font-bold tracking-wide text-slate-800">
              {newCred.password}
            </code>
            <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(newCred.password)}>
              Kopier
            </Button>
            <Button variant="ghost" onClick={() => setNewCred(null)}>
              Lukk
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h3 className="mb-4 font-semibold text-slate-700">Legg til bruker</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-post (brukernavn)"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="kallenavn (for «Run …, run!»)"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
          />
          <Button onClick={addUser} disabled={busy}>
            {busy ? "Oppretter…" : "Legg til"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-3">Kallenavn</th>
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Rolle</th>
              <th className="px-4 py-3">Opprettet</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{u.nickname}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.role === "admin" ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{dateNo(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  {u.role !== "admin" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => resetPw(u.id, u.email)} className="text-xs text-brand-600 hover:underline">
                        Nytt passord
                      </button>
                      <button onClick={() => remove(u.id, u.email)} className="text-xs text-rose-500 hover:underline">
                        Slett
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
