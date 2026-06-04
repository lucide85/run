import { ReactNode } from "react";
import { SESSION_LABELS, TYPE_DESIGN } from "../lib/format";

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div className="ph-l">
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {action && <div className="ph-actions">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="val tnum">{value}</div>
      {hint && <div className="foot">{hint}</div>}
    </div>
  );
}

/** Generisk chip i Sporty-Plania-stil. */
export function Chip({ kind, children }: { kind: string; children: ReactNode }) {
  const known = ["rolig", "kvalitet", "langtur", "lop", "fullfort", "plan", "admin", "user"];
  const cls = known.includes(kind) ? `chip-${kind}` : "chip-plan";
  const dot = ["rolig", "kvalitet", "langtur", "lop", "fullfort"].includes(kind);
  return (
    <span className={`chip ${cls}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const kind = TYPE_DESIGN[type] || "plan";
  return <Chip kind={kind}>{SESSION_LABELS[type] ?? type}</Chip>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; kind: string }> = {
    planned: { label: "Planlagt", kind: "plan" },
    completed: { label: "Fullført", kind: "fullfort" },
    skipped: { label: "Hoppet over", kind: "lop" },
    moved: { label: "Flyttet", kind: "kvalitet" },
  };
  const m = map[status] ?? map.planned;
  return <Chip kind={m.kind}>{m.label}</Chip>;
}

export function Spinner({ label = "Laster…" }: { label?: string }) {
  return (
    <div className="muted" style={{ padding: "40px 0", textAlign: "center", fontSize: 14 }}>
      <i className="fa-solid fa-arrows-rotate fa-spin" style={{ marginRight: 8, opacity: 0.6 }} />
      {label}
    </div>
  );
}

type BtnVariant = "primary" | "ghost" | "soft" | "secondary" | "ai" | "danger";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  size?: "sm" | "lg";
}) {
  const v: Record<BtnVariant, string> = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    soft: "btn-soft",
    secondary: "btn-secondary",
    ai: "btn-ai",
    danger: "btn-danger-text",
  };
  const sz = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${v[variant]} ${sz} ${className}`}
    >
      {children}
    </button>
  );
}

/** SVG-fremdriftsring (brukt i hero på Oversikt). */
export function Ring({
  pct,
  size = 140,
  stroke = 13,
  color = "var(--primary-300)",
  track = "rgba(255,255,255,0.12)",
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct || 0)));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms var(--ease)" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
