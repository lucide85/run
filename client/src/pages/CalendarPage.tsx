import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg, EventClickArg } from "@fullcalendar/core";
import { api, PlannedSession } from "../api/client";
import { Button, Card, PageTitle, Spinner, TypeBadge } from "../components/ui";
import { SESSION_COLORS, SESSION_LABELS } from "../lib/format";

export default function CalendarPage() {
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    setError(null);
    try {
      setSessions(await api.sessions());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function onDrop(info: EventDropArg) {
    const id = Number(info.event.id);
    // startStr er ren «YYYY-MM-DD» for heldagshendelser – unngår at lokal
    // midnatt blir forrige dag i UTC (toISOString-fella).
    const day = info.event.startStr;
    if (!day) {
      info.revert();
      return;
    }
    try {
      // Appen lagrer datoer som UTC klokken 12 for å være tidssone-trygg
      await api.updateSession(id, { date: `${day.slice(0, 10)}T12:00:00.000Z` });
      await load();
    } catch (e) {
      info.revert();
      alert((e as Error).message);
    }
  }

  function onClick(info: EventClickArg) {
    navigate(`/plan/${info.event.id}`);
  }

  if (loading) return <Spinner />;
  if (error)
    return (
      <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>Kunne ikke laste innhold.</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            load();
          }}
        >
          <i className="fa-solid fa-arrows-rotate" />
          Prøv igjen
        </Button>
      </Card>
    );

  const events = sessions.map((s) => {
    const done = s.status === "completed";
    // Fullførte økter koblet til en registrert økt er låst – kan ikke dras.
    const locked = done && s.workoutId != null;
    return {
      id: String(s.id),
      title: locked ? `✓ ${s.title}` : s.title,
      start: s.date.slice(0, 10),
      allDay: true,
      backgroundColor: done ? "#0E8540" : SESSION_COLORS[s.type],
      borderColor: done ? "#0E8540" : SESSION_COLORS[s.type],
      startEditable: !locked,
      extendedProps: { type: s.type, status: s.status, workoutId: s.workoutId ?? null },
    };
  });

  return (
    <div>
      <PageTitle
        title="Kalender"
        subtitle="Dra en økt til en annen dag for å flytte den"
      />

      <div className="mb-4 flex flex-wrap gap-3">
        {Object.entries(SESSION_LABELS).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SESSION_COLORS[type] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#0E8540" }} />
          Fullført
        </span>
      </div>

      <Card>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="no"
          firstDay={1}
          height="auto"
          editable
          eventStartEditable
          eventDurationEditable={false}
          events={events}
          eventDrop={onDrop}
          eventClick={onClick}
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          buttonText={{ today: "I dag" }}
          dayMaxEvents={3}
        />
      </Card>
    </div>
  );
}
