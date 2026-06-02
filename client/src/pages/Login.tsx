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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60"
      >
        <div className="mb-6 text-center">
          <div className="text-4xl">🏃</div>
          <h1 className="mt-2 text-xl font-bold text-slate-800">Run Assi, run!</h1>
          <p className="text-sm text-slate-400">Logg inn for å fortsette</p>
        </div>
        <label className="mb-3 block">
          <span className="text-sm font-medium text-slate-600">E-post / brukernavn</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            autoFocus
          />
        </label>
        <label className="mb-5 block">
          <span className="text-sm font-medium text-slate-600">Passord</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        {error && <p className="mb-4 text-sm text-rose-500">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Logger inn…" : "Logg inn"}
        </button>
      </form>
    </div>
  );
}
