import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, Me } from "../api/client";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const TRENING: NavItem[] = [
  { to: "/", label: "Oversikt", icon: "fa-gauge-high", end: true },
  { to: "/kalender", label: "Kalender", icon: "fa-calendar-days" },
  { to: "/program", label: "Program", icon: "fa-clipboard-list" },
  { to: "/okter", label: "Økter", icon: "fa-shoe-prints" },
  { to: "/progresjon", label: "Progresjon", icon: "fa-chart-line" },
  { to: "/kompis", label: "Kompis", icon: "fa-egg" },
];

function BrandMark({ size }: { size?: number }) {
  const style = size
    ? { width: size, height: size, fontSize: size * 0.47, borderRadius: size * 0.3 }
    : undefined;
  return (
    <div className="mark" style={style}>
      <i className="fa-solid fa-person-running" />
    </div>
  );
}

export function Layout({ children, me, onLogout }: { children: ReactNode; me: Me | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const nickname = me?.nickname ?? "løper";
  const title = `Run ${nickname}, run!`;

  const konto: NavItem[] = [{ to: "/innstillinger", label: "Innstillinger", icon: "fa-gear" }];
  if (me?.role === "admin") konto.push({ to: "/admin", label: "Brukere", icon: "fa-user-group" });
  const allItems = [...TRENING, ...konto];

  async function logout() {
    await api.logout();
    onLogout();
  }

  const navClass = ({ isActive }: { isActive: boolean }) => `navitem ${isActive ? "active" : ""}`;

  return (
    <div className="shell">
      {/* Desktop nav-rail */}
      <aside className="rail">
        <div className="brand">
          <BrandMark />
          <div className="wm">
            <b>{title}</b>
            <span>AI-løpetrener</span>
          </div>
        </div>

        <div className="navlabel">Trening</div>
        {TRENING.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={navClass}>
            <i className={`fa-solid ${it.icon}`} />
            {it.label}
          </NavLink>
        ))}

        <div className="navlabel">Konto</div>
        {konto.map((it) => (
          <NavLink key={it.to} to={it.to} className={navClass}>
            <i className={`fa-solid ${it.icon}`} />
            {it.label}
          </NavLink>
        ))}

        <div className="spacer" />
        <div className="rail-foot">
          <button className="navitem" onClick={logout}>
            <i className="fa-solid fa-right-from-bracket" /> Logg ut
          </button>
          <div
            className="rail-user"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/innstillinger")}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate("/innstillinger");
            }}
          >
            <div className="av">{nickname.charAt(0).toUpperCase()}</div>
            <div className="who">
              <b>{nickname}</b>
              <span>{me?.email}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Hovedinnhold (scroll-container) */}
      <div className="main">
        <header className="topbar-m show-m">
          <BrandMark size={32} />
          <b>{title}</b>
          <button className="ham" onClick={() => setOpen(true)} aria-label="Meny">
            <i className="fa-solid fa-bars" />
          </button>
        </header>
        <div className="main-inner">{children}</div>
      </div>

      {/* Mobil skuff */}
      <div className={`drawer-scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <div className={`drawer ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Meny">
        <div className="brand" style={{ paddingBottom: 10 }}>
          <BrandMark size={36} />
          <div className="wm">
            <b>{title}</b>
            <span>AI-løpetrener</span>
          </div>
        </div>
        {allItems.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={navClass} onClick={() => setOpen(false)}>
            <i className={`fa-solid ${it.icon}`} />
            {it.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <button
          className="navitem"
          onClick={() => {
            setOpen(false);
            logout();
          }}
        >
          <i className="fa-solid fa-right-from-bracket" /> Logg ut
        </button>
      </div>
    </div>
  );
}
