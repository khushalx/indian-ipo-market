"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import type { EventType, IPO, IPOEvent, IPOType } from "@/types";
import styles from "./calendar.module.css";

type CalendarView = "month" | "timeline";
type BoardFilter = "all" | IPOType;
type EventFilter = "all" | "ipo_open" | "ipo_close" | "basis_of_allotment" | "listing" | "drhp_filed" | "rhp_filed";

interface CalendarWorkspaceProps {
  ipos: IPO[];
  events: IPOEvent[];
  initialDate?: string;
  isMock?: boolean;
  dataUnavailable?: boolean;
}

const relevantEventTypes = new Set<EventType>([
  "ipo_open",
  "ipo_close",
  "basis_of_allotment",
  "listing",
  "drhp_filed",
  "rhp_filed",
]);

const eventMeta: Record<EventFilter, { label: string; shortLabel: string; className: string }> = {
  all: { label: "All events", shortLabel: "All", className: "" },
  ipo_open: { label: "IPO opens", shortLabel: "Opens", className: styles.opens },
  ipo_close: { label: "IPO closes", shortLabel: "Closes", className: styles.closes },
  basis_of_allotment: { label: "Allotment", shortLabel: "Allotment", className: styles.allotment },
  listing: { label: "Listing", shortLabel: "Listing", className: styles.listing },
  drhp_filed: { label: "DRHP filing", shortLabel: "DRHP", className: styles.drhp },
  rhp_filed: { label: "RHP filing", shortLabel: "RHP", className: styles.drhp },
};

const boardOptions: Array<{ value: BoardFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

const eventOptions: EventFilter[] = [
  "all",
  "ipo_open",
  "ipo_close",
  "basis_of_allotment",
  "listing",
  "drhp_filed",
  "rhp_filed",
];

const dayHeadings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDate(value));
}

function monthSeed(events: IPOEvent[], initialDate?: string) {
  const current = events.find((event) => event.state === "current" && relevantEventTypes.has(event.type));
  return parseDate(initialDate ?? current?.date ?? events[0]?.date ?? new Date().toISOString().slice(0, 10));
}

export default function CalendarWorkspace({ ipos, events, initialDate, isMock = false, dataUnavailable = false }: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("month");
  const [board, setBoard] = useState<BoardFilter>("all");
  const [eventType, setEventType] = useState<EventFilter>("all");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = monthSeed(events, initialDate);
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(monthSeed(events, initialDate)));

  const ipoById = useMemo(() => new Map(ipos.map((ipo) => [ipo.id, ipo])), [ipos]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => relevantEventTypes.has(event.type))
        .filter((event) => eventType === "all" || event.type === eventType)
        .filter((event) => board === "all" || ipoById.get(event.ipoId)?.type === board)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [board, eventType, events, ipoById],
  );

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, IPOEvent[]>();
    filteredEvents.forEach((event) => {
      const key = event.date.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    });
    return grouped;
  }, [filteredEvents]);

  const monthDays = useMemo(() => getMonthDays(visibleMonth), [visibleMonth]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const resetMonth = () => {
    const seed = monthSeed(events, initialDate);
    setVisibleMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
    setSelectedDate(toDateKey(seed));
  };

  const selectDay = (date: Date) => {
    setSelectedDate(toDateKey(date));
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>PRIMARY MARKET SCHEDULE</p>
          <h1>IPO Calendar</h1>
          <p className={styles.lede}>Every important filing, offer and listing date in one considered view.</p>
        </div>
        <div className={styles.dataNote}>
          <span aria-hidden="true" />
          {dataUnavailable ? "Data temporarily unavailable" : isMock ? "Development data · Not live" : "Database events · Source dates preserved"}
        </div>
      </header>

      <section className={styles.workspace} aria-label="IPO event calendar">
        <div className={styles.primaryToolbar}>
          <div className={styles.viewSwitch} role="group" aria-label="Calendar display">
            <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>
              <CalendarDays size={14} aria-hidden="true" /> Calendar
            </button>
            <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>
              <List size={14} aria-hidden="true" /> Timeline
            </button>
          </div>

          <div className={styles.boardSwitch} role="group" aria-label="IPO board">
            {boardOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={board === option.value}
                onClick={() => setBoard(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.eventFilters} aria-label="Filter event types">
          <span>Show</span>
          <div role="group" aria-label="Event type">
            {eventOptions.map((type) => (
              <button
                type="button"
                key={type}
                aria-pressed={eventType === type}
                onClick={() => setEventType(type)}
              >
                {type !== "all" && <i className={eventMeta[type].className} aria-hidden="true" />}
                {eventMeta[type].shortLabel}
              </button>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <div>
            <div className={styles.monthToolbar}>
              <h2 aria-live="polite">
                {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(visibleMonth)}
              </h2>
              <div className={styles.monthActions}>
                <button type="button" onClick={resetMonth}>Today</button>
                <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div className={styles.calendarFrame}>
              <table className={styles.calendar}>
                <caption className={styles.srOnly}>IPO events by date</caption>
                <thead>
                  <tr>{dayHeadings.map((day) => <th scope="col" key={day}>{day}</th>)}</tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, week) => (
                    <tr key={week}>
                      {monthDays.slice(week * 7, week * 7 + 7).map((date) => {
                        const key = toDateKey(date);
                        const dayEvents = eventsByDate.get(key) ?? [];
                        const outside = date.getMonth() !== visibleMonth.getMonth();
                        const selected = key === selectedDate;
                        const today = key === initialDate?.slice(0, 10);
                        return (
                          <td key={key} className={outside ? styles.outsideMonth : undefined}>
                            <button
                              type="button"
                              className={`${selected ? styles.selectedDay : ""} ${today ? styles.today : ""}`}
                              onClick={() => selectDay(date)}
                              aria-pressed={selected}
                              aria-current={today ? "date" : undefined}
                              aria-label={`${formatFullDate(key)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}` : ", no events"}`}
                            >
                              <span className={styles.dayNumber}>{date.getDate()}</span>
                              <span className={styles.cellEvents} aria-hidden="true">
                                {dayEvents.slice(0, 3).map((event) => {
                                  const ipo = ipoById.get(event.ipoId);
                                  const meta = eventMeta[event.type as EventFilter];
                                  return (
                                    <span className={`${styles.calendarEvent} ${meta.className}`} key={event.id}>
                                      <b>{meta.shortLabel}</b>
                                      <em>{ipo?.company.name ?? event.label}</em>
                                    </span>
                                  );
                                })}
                                {dayEvents.length > 3 && <span className={styles.moreEvents}>+{dayEvents.length - 3} more</span>}
                              </span>
                              <span className={styles.mobileDots} aria-hidden="true">
                                {dayEvents.slice(0, 3).map((event) => (
                                  <i className={eventMeta[event.type as EventFilter].className} key={event.id} />
                                ))}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!filteredEvents.length && (
              <div className={styles.inlineEmpty} role="status">
                No calendar events match these filters. Try showing all events or both IPO boards.
              </div>
            )}

            <div className={styles.selectedAgenda}>
              <p className={styles.agendaDate}>{formatFullDate(selectedDate)}</p>
              {selectedEvents.length ? (
                <div className={styles.agendaItems}>
                  {selectedEvents.map((event) => (
                    <EventRow event={event} ipo={ipoById.get(event.ipoId)} key={event.id} />
                  ))}
                </div>
              ) : (
                <p className={styles.noDayEvents}>No IPO events scheduled for this date.</p>
              )}
            </div>
          </div>
        ) : (
          <Timeline events={filteredEvents} ipoById={ipoById} />
        )}
      </section>
    </main>
  );
}

function EventRow({ event, ipo }: { event: IPOEvent; ipo?: IPO }) {
  const meta = eventMeta[event.type as EventFilter];
  return (
    <article className={`${styles.eventRow} ${meta.className}`}>
      <span className={`${styles.eventMarker} ${meta.className}`} aria-hidden="true" />
      <div className={styles.eventCopy}>
        <span>{meta.label}</span>
        <strong>{ipo?.company.name ?? event.label}</strong>
        {event.note && <p>{event.note}</p>}
      </div>
      <div className={styles.eventMeta}>
        <span>{ipo ? (ipo.type === "sme" ? "SME" : "Mainboard") : "Unclassified"}</span>
        <small>{event.state} · {event.source.sourceName}</small>
      </div>
    </article>
  );
}

function Timeline({ events, ipoById }: { events: IPOEvent[]; ipoById: Map<string, IPO> }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, IPOEvent[]>();
    const ordered = [...events].sort((left, right) => {
      const leftPast = left.state === "completed" ? 1 : 0;
      const rightPast = right.state === "completed" ? 1 : 0;
      if (leftPast !== rightPast) return leftPast - rightPast;
      return leftPast ? right.date.localeCompare(left.date) : left.date.localeCompare(right.date);
    });
    ordered.forEach((event) => {
      const key = event.date.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    });
    return [...grouped.entries()];
  }, [events]);

  if (!groups.length) {
    return (
      <div className={styles.emptyState}>
        <CalendarDays size={20} aria-hidden="true" />
        <h2>No events match these filters</h2>
        <p>Try showing all event types or both IPO boards.</p>
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      <p className={styles.resultCount}>{events.length} scheduled {events.length === 1 ? "event" : "events"}</p>
      {groups.map(([date, dateEvents]) => {
        const parsed = parseDate(date);
        return (
          <section className={styles.timelineGroup} key={date} aria-labelledby={`date-${date}`}>
            <div className={styles.timelineDate}>
              <span>{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(parsed)}</span>
              <strong id={`date-${date}`}>{parsed.getDate()}</strong>
              <small>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(parsed)}</small>
            </div>
            <div className={styles.timelineEvents}>
              {dateEvents.map((event) => <EventRow event={event} ipo={ipoById.get(event.ipoId)} key={event.id} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
