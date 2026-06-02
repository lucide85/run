import { useState } from "react";
import { api } from "../api/client";
import { Button } from "./ui";

export function SyncButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.sync();
      setMsg(
        `Importerte ${r.imported}, koblet ${r.matched}${r.errors.length ? `, ${r.errors.length} feil` : ""}.`
      );
      onDone?.();
    } catch (e) {
      setMsg(`Synk feilet: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <Button onClick={run} disabled={busy}>
        {busy ? "Synker…" : "↻ Synk med Garmin"}
      </Button>
    </div>
  );
}
