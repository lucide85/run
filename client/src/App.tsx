import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api, Me } from "./api/client";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import Program from "./pages/Program";
import WorkoutDetail from "./pages/WorkoutDetail";
import PlanSessionDetail from "./pages/PlanSessionDetail";
import Progress from "./pages/Progress";
import Workouts from "./pages/Workouts";
import SettingsPage from "./pages/SettingsPage";
import Admin from "./pages/Admin";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  async function check() {
    try {
      const s = await api.authStatus();
      setAuthed(s.authenticated);
      if (s.authenticated) {
        const m = await api.me();
        setMe(m);
        document.title = `Run ${m.nickname}, run!`;
      }
    } catch {
      setAuthed(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  if (authed === null) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Laster…</div>;
  }

  if (!authed) {
    return <Login onLogin={check} />;
  }

  if (!me) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Laster…</div>;
  }

  if (me.mustOnboard) {
    return <Onboarding nickname={me.nickname} onDone={() => check()} />;
  }

  return (
    <Layout me={me} onLogout={check}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/kalender" element={<CalendarPage />} />
        <Route path="/program" element={<Program />} />
        <Route path="/okter" element={<Workouts />} />
        <Route path="/okter/:id" element={<WorkoutDetail />} />
        <Route path="/plan/:id" element={<PlanSessionDetail />} />
        <Route path="/progresjon" element={<Progress />} />
        <Route path="/innstillinger" element={<SettingsPage onChange={check} />} />
        <Route path="/onboarding" element={<Onboarding nickname={me?.nickname ?? ""} onDone={check} />} />
        {me?.role === "admin" && <Route path="/admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
