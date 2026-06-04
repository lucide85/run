import { useState } from "react";
import { api } from "../api/client";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(username, password);
      onLogin();
    } catch {
      setError("Feil brukernavn eller passord");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="card login-card fadein">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div className="mark" style={{ width: 54, height: 54, fontSize: 25, borderRadius: 16 }}>
            <i className="fa-solid fa-person-running" />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.5 }}>Run, run!</div>
            <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>Logg inn for å fortsette</div>
          </div>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label>E-post / brukernavn</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Passord</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--error-500)", fontSize: 13.5, margin: 0 }}>{error}</p>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Logger inn…" : "Logg inn"} <i className="fa-solid fa-arrow-right" />
          </button>
        </form>
      </div>
      <div className="muted" style={{ marginTop: 20, fontSize: 12.5, textAlign: "center" }}>
        AI-løpetrener · mot ditt neste løp
      </div>
    </div>
  );
}
