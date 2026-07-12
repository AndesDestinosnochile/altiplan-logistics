import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
    code: string;
    customer: { full_name: string; phone: string | null; pax_count: number } | null;
    hotel: { name: string; address: string | null } | null;
  } | null;
}

function LogisticsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(in30);

  const { data = [], isLoading } = useQuery({
    queryKey: ["logistics", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservation_tours")
        .select("id,name,tour_date,pax,status,notes,reservation:reservations(code,customer:customers(full_name,phone,pax_count),hotel:hotels(name,address))")
        .gte("tour_date", from)
        .lte("tour_date", to)
        .order("tour_date");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const grouped = data.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.tour_date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Operação</p>
        <h1 className="mt-1 text-3xl">Logística</h1>
        <p className="mt-1 text-sm text-muted-foreground">Passeios agrupados por dia, com passageiros e hotéis.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && Object.keys(grouped).length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum passeio no período.</CardContent></Card>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([date, rows]) => (
          <Card key={date}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>
                <Badge variant="secondary">{rows.reduce((a, r) => a + r.pax, 0)} pax</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.pax} pax</Badge>
                      <Badge>{r.status}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <div>Reserva: <span className="font-mono">{r.reservation?.code}</span> — {r.reservation?.customer?.full_name}</div>
                    {r.reservation?.customer?.phone && <div>Tel: {r.reservation.customer.phone}</div>}
                    {r.reservation?.hotel && <div>Hotel: {r.reservation.hotel.name} {r.reservation.hotel.address ? `— ${r.reservation.hotel.address}` : ""}</div>}
                    {r.notes && <div className="mt-1 italic">{r.notes}</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
