import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Users, Hotel as HotelIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/logistics")({
  component: LogisticsPage,
});

interface Row {
  id: string;
  name: string;
  tour_date: string;
  pax: number;
  status: string;
  notes: string | null;
  reservation: {
    id: string;
    code: string;
    customer: { full_name: string; phone: string | null; pax_count: number } | null;
    hotel: { name: string; address: string | null; city: string | null } | null;
  } | null;
}

function monthBounds(anchor: Date) {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last), label: first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
}

function LogisticsPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const { from, to, label } = useMemo(() => monthBounds(anchor), [anchor]);

  const [tourFilter, setTourFilter] = useState("");
  const [hotelFilter, setHotelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["logistics", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_tours")
        .select(`
          id,name,tour_date,pax,status,notes,
          reservation:reservations(
            id,code,
            customer:customers(full_name,phone,pax_count),
            hotel:hotels(name,address,city)
          )
        `)
        .gte("tour_date", from)
        .lte("tour_date", to)
        .order("tour_date");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => data.filter((r) => {
    if (tourFilter && !r.name.toLowerCase().includes(tourFilter.toLowerCase())) return false;
    if (hotelFilter && !(r.reservation?.hotel?.name ?? "").toLowerCase().includes(hotelFilter.toLowerCase())) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  }), [data, tourFilter, hotelFilter, statusFilter]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, Row[]>>((acc, r) => {
      (acc[r.tour_date] ??= []).push(r);
      return acc;
    }, {});
  }, [filtered]);

  const totalPax = filtered.reduce((a, r) => a + r.pax, 0);
  const uniqueTours = new Set(filtered.map((r) => r.name)).size;

  function shift(delta: number) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Operação</p>
          <h1 className="mt-1 text-3xl">Logística</h1>
          <p className="mt-1 text-sm text-muted-foreground">Passeios do mês agrupados por dia.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-40 text-center font-medium capitalize">{label}</div>
          <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>Hoje</Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Passeios" value={String(filtered.length)} />
        <MetricCard label="Passageiros" value={String(totalPax)} icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Tipos" value={String(uniqueTours)} />
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1.5"><Label>Passeio</Label>
            <Input placeholder="filtrar por nome" value={tourFilter} onChange={(e) => setTourFilter(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Hotel</Label>
            <Input placeholder="filtrar por hotel" value={hotelFilter} onChange={(e) => setHotelFilter(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && Object.keys(grouped).length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum passeio no período.</CardContent></Card>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([date, rows]) => {
          const dayPax = rows.reduce((a, r) => a + r.pax, 0);
          return (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="capitalize">
                    {new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{rows.length} passeios</Badge>
                    <Badge variant="secondary">{dayPax} pax</Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{r.pax} pax</Badge>
                        <Badge variant={r.status === "confirmed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>{r.status}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                      <div>
                        Reserva:{" "}
                        {r.reservation && (
                          <Link to="/reservations/$id" params={{ id: r.reservation.id }} className="font-mono text-primary hover:underline">
                            {r.reservation.code}
                          </Link>
                        )}{" "}
                        — {r.reservation?.customer?.full_name}
                        {r.reservation?.customer?.phone && <span> · {r.reservation.customer.phone}</span>}
                      </div>
                      {r.reservation?.hotel && (
                        <div className="flex items-center gap-1"><HotelIcon className="h-3 w-3" /> {r.reservation.hotel.name}{r.reservation.hotel.address ? ` — ${r.reservation.hotel.address}` : ""}{r.reservation.hotel.city ? `, ${r.reservation.hotel.city}` : ""}</div>
                      )}
                      
                      {r.notes && <div className="mt-1 italic">{r.notes}</div>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}
