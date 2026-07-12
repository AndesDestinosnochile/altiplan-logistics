import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

interface Event {
  id: string;
  code: string;
  check_in: string | null;
  check_out: string | null;
  customers: { full_name: string } | null;
}

function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86400000));

  const from = days[0].toISOString().slice(0, 10);
  const to = days[41].toISOString().slice(0, 10);

  const { data: reservations = [] } = useQuery({
    queryKey: ["calendar-res", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id,code,check_in,check_out,customers(full_name)")
        .or(`check_in.gte.${from},check_out.lte.${to}`);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
  });
  const { data: tours = [] } = useQuery({
    queryKey: ["calendar-tours", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_tours")
        .select("id,name,tour_date,pax")
        .gte("tour_date", from)
        .lte("tour_date", to);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; tour_date: string; pax: number }[];
    },
  });

  function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

  const eventsByDay = new Map<string, { label: string; kind: "in" | "out" | "tour" }[]>();
  for (const r of reservations) {
    if (r.check_in) (eventsByDay.get(r.check_in) ?? eventsByDay.set(r.check_in, []).get(r.check_in)!).push({ label: `IN ${r.customers?.full_name ?? r.code}`, kind: "in" });
    if (r.check_out) (eventsByDay.get(r.check_out) ?? eventsByDay.set(r.check_out, []).get(r.check_out)!).push({ label: `OUT ${r.customers?.full_name ?? r.code}`, kind: "out" });
  }
  for (const t of tours) {
    (eventsByDay.get(t.tour_date) ?? eventsByDay.set(t.tour_date, []).get(t.tour_date)!).push({ label: `${t.name} (${t.pax})`, kind: "tour" });
  }

  const monthName = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Operação</p>
          <h1 className="mt-1 text-3xl capitalize">{monthName}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => (
              <div key={d} className="px-2 py-2 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.getMonth() === month;
              const key = dayKey(d);
              const evts = eventsByDay.get(key) ?? [];
              return (
                <div key={key} className={`min-h-24 border-b border-r p-1.5 text-xs ${inMonth ? "" : "bg-muted/20 text-muted-foreground"}`}>
                  <div className="mb-1 text-right font-medium">{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {evts.slice(0, 3).map((e, i) => (
                      <div key={i} className={`truncate rounded px-1 py-0.5 ${e.kind === "in" ? "bg-emerald-500/15 text-emerald-700" : e.kind === "out" ? "bg-amber-500/15 text-amber-700" : "bg-blue-500/15 text-blue-700"}`}>{e.label}</div>
                    ))}
                    {evts.length > 3 && <div className="text-[10px] text-muted-foreground">+{evts.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
