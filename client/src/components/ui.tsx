import { ReactNode } from "react";
import { SESSION_COLORS, SESSION_LABELS } from "../lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-800">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${SESSION_COLORS[type]}22`, color: SESSION_COLORS[type] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SESSION_COLORS[type] }} />
      {SESSION_LABELS[type] ?? type}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    planned: { label: "Planlagt", cls: "bg-slate-100 text-slate-500" },
    completed: { label: "Fullført", cls: "bg-emerald-100 text-emerald-600" },
    skipped: { label: "Hoppet over", cls: "bg-rose-100 text-rose-600" },
    moved: { label: "Flyttet", cls: "bg-amber-100 text-amber-600" },
  };
  const m = map[status] ?? map.planned;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export function Spinner({ label = "Laster…" }: { label?: string }) {
  return <div className="py-10 text-center text-slate-400">{label}</div>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "soft";
  disabled?: boolean;
  className?: string;
}) {
  const base = "rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50";
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "border border-slate-200 text-slate-600 hover:bg-slate-100",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
