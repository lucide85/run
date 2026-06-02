import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { api, Me } from "../api/client";

const NAV = [
  { to: "/", label: "Oversikt", icon: "🏠" },
  { to: "/kalender", label: "Kalender", icon: "📅" },
  { to: "/program", label: "Program", icon: "📋" },
  { to: "/okter", label: "Økter", icon: "👟" },
  { to: "/progresjon", label: "Progresjon", icon: "📈" },
  { to: "/innstillinger", label: "Innstillinger", icon: "⚙️" },
];

export function Layout({ children, me, onLogout }: { children: ReactNode; me: Me | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const title = me ? `Run ${me.nickname}, run!` : "Run, run!";
  const nav = me?.role === "admin" ? [...NAV, { to: "/admin", label: "Brukere", icon: "👥" }] : NAV;

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Topbar (mobil) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-semibold text-slate-700">🏃 {title}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Meny"
        >
          ☰
        </button>
      </header>

      {/* Bakteppe når menyen er åpen (mobil) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar / drawer – overlay på mobil, alltid synlig (sticky) på desktop */}
      <aside
        className={`${
          open ? "fixed inset-y-0 left-0 z-40 block w-72 shadow-2xl" : "hidden"
        } overflow-y-auto border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:z-auto lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:shadow-none`}
      >
        <div className="flex items-center gap-2 px-6 py-5 text-lg font-bold text-slate-800">
          <span>🏃</span> {title}
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="mt-2 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            <span className="text-base">🚪</span> Logg ut
          </button>
        </nav>
      </aside>

      {/* Innhold */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
