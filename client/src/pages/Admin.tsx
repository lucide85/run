import { useEffect, useState } from "react";
import { api, AdminUser } from "../api/client";
import { PageTitle, Button, Spinner, Chip } from "../components/ui";
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
    <div style={{ maxWidth: 860 }}>
      <PageTitle title="Brukere" subtitle="Administrer hvem som har tilgang" />

      {newCred && (
        <div className="card mb18" style={{ borderColor: "var(--success-100)" }}>
          <div className="card-body">
            <h3 style={{ margin: 0, fontWeight: 700 }}>
              <i className="fa-solid fa-circle-check" style={{ color: "var(--t-fullfort)", marginRight: 8 }} />
              Passord generert
            </h3>
            <p style={{ marginTop: 8 }}>
              Del dette med <strong>{newCred.email}</strong>. Det vises bare denne ene gangen:
            </p>
            <div className="flex items-center gap12 wrap" style={{ marginTop: 6 }}>
              <code
                style={{
                  background: "var(--grey-50)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              >
                {newCred.password}
              </code>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(newCred.password)}>
                <i className="fa-regular fa-copy" /> Kopier
              </Button>
              <Button variant="ghost" onClick={() => setNewCred(null)}>
                Lukk
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="card mb18">
        <div className="card-head">
          <h3>Legg til bruker</h3>
        </div>
        <div className="card-body">
          <div className="flex gap12 wrap items-end">
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>E-post (brukernavn)</label>
              <input className="input" placeholder="navn@epost.no" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Kallenavn (for «Run …, run!»)</label>
              <input className="input" placeholder="f.eks. Leni" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <Button onClick={addUser} disabled={busy}>
              <i className="fa-solid fa-plus" />
              {busy ? "Oppretter…" : "Legg til"}
            </Button>
          </div>
          {error && <p style={{ color: "var(--error-500)", fontSize: 13.5, marginBottom: 0 }}>{error}</p>}
        </div>
      </div>

      {/* Desktop-tabell */}
      <div className="card hide-m" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Kallenavn</th>
              <th>E-post</th>
              <th>Rolle</th>
              <th>Opprettet</th>
              <th className="r">Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.nickname}</td>
                <td className="muted">{u.email}</td>
                <td>
                  <Chip kind={u.role === "admin" ? "admin" : "user"}>{u.role}</Chip>
                </td>
                <td className="muted">{dateNo(u.createdAt)}</td>
                <td className="r">
                  {u.role !== "admin" && (
                    <span className="flex gap12" style={{ justifyContent: "flex-end" }}>
                      <span className="link" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => resetPw(u.id, u.email)}>
                        Nytt passord
                      </span>
                      <span className="btn-danger-text" style={{ fontSize: 13, cursor: "pointer" }} onClick={() => remove(u.id, u.email)}>
                        Slett
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil-kort */}
      <div className="show-m" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} className="card" style={{ padding: "14px 16px" }}>
            <div className="flex between items-center">
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{u.nickname}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{u.email}</div>
              </div>
              <Chip kind={u.role === "admin" ? "admin" : "user"}>{u.role}</Chip>
            </div>
            {u.role !== "admin" && (
              <div className="flex gap16" style={{ marginTop: 12 }}>
                <span className="link" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => resetPw(u.id, u.email)}>
                  Nytt passord
                </span>
                <span className="btn-danger-text" style={{ fontSize: 13, cursor: "pointer" }} onClick={() => remove(u.id, u.email)}>
                  Slett
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
