"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { SectionHeader } from "@/components/doz/ui-primitives";
import { toast } from "sonner";

interface CalEvent {
  id: string; type: string; title: string; date: string; color: string;
  project?: any; assignee?: string; amount?: number; contact?: string;
}

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-500", teal: "bg-teal-500", amber: "bg-amber-500", rose: "bg-rose-500",
};
const TYPE_LABELS: Record<string, string> = {
  PROJECT: "Project", TASK: "Task", INVOICE: "Invoice", FOLLOWUP: "Follow-up",
};

export function CalendarView() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/doz/calendar").then(r => r.json()).then(d => { setEvents(d.events || []); setLoading(false); }).catch(() => { setLoading(false); toast.error("Couldn't load calendar"); });
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const eventsByDay: Record<number, CalEvent[]> = {};
  for (const e of events) {
    if (!e.date) continue;
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(e);
    }
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null); }

  if (loading) return <Skeleton className="h-96 w-full" />;

  const selectedEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  return (
    <div className="space-y-4">
      <SectionHeader icon={<CalIcon className="h-5 w-5" />} title="Calendar" subtitle="All projects, tasks, and deadlines at a glance" />

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{monthNames[month]} {year}</h2>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map(d => <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startWeekday }, (_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dayEvents = eventsByDay[day] || [];
                const isToday = isCurrentMonth && day === today.getDate();
                const isSelected = day === selectedDay;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={`min-h-[60px] rounded-lg border p-1.5 text-left transition-colors sm:min-h-[80px] ${
                      isSelected ? "border-primary bg-primary/10" : isToday ? "border-primary/50" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{day}</span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <div key={e.id} className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_MAP[e.color] || "bg-muted"}`} />
                          <span className="truncate text-[9px] text-muted-foreground hidden sm:inline">{e.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
              {Object.entries(TYPE_LABELS).map(([type, label]) => {
                const colors = { PROJECT: "emerald", TASK: "teal", INVOICE: "amber", FOLLOWUP: "rose" };
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${COLOR_MAP[colors[type as keyof typeof colors]]}`} />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Day Detail Panel */}
        <div>
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {selectedDay ? `${monthNames[month]} ${selectedDay}` : "Select a day"}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">{selectedDay ? "No events on this day." : "Click any day to see events."}</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(e => (
                  <div key={e.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`h-2 w-2 rounded-full ${COLOR_MAP[e.color]}`} />
                      <Badge variant="outline" className="text-[9px]">{TYPE_LABELS[e.type]}</Badge>
                    </div>
                    <p className="text-xs font-medium">{e.title}</p>
                    {e.project?.venue && <p className="text-[10px] text-muted-foreground">📍 {e.project.venue}</p>}
                    {e.assignee && <p className="text-[10px] text-muted-foreground">👤 {e.assignee}</p>}
                    {e.amount !== undefined && <p className="text-[10px] text-muted-foreground">₦{e.amount.toLocaleString()}</p>}
                    {e.contact && <p className="text-[10px] text-muted-foreground">📞 {e.contact}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
