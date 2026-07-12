import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  DollarSign,
  ReceiptText,
  Users2,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { SupabaseSetupBanner } from "@/components/common/supabase-setup-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, SUPABASE_CONFIGURED } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

interface Metrics {
  reservations_count: number;
  pax_total: number;
  sold_amount: number;
  received_amount: number;
  pending_balance: number;
}

function DashboardPage() {
  const { t } = useTranslation();

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["dashboard-metrics"],
    enabled: SUPABASE_CONFIGURED,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc("dashboard_metrics", { _from: from, _to: to });
      if (error) throw error;
      return data as Metrics;
    },
  });

  const cards = [
    { label: "Reservas do mês", value: metrics?.reservations_count ?? 0, icon: ReceiptText },
    { label: "Passageiros", value: metrics?.pax_total ?? 0, icon: Users2 },
    {
      label: "Valor vendido",
      value: formatMoney(metrics?.sold_amount ?? 0, "BRL"),
      icon: DollarSign,
    },
    {
      label: "Valor recebido",
      value: formatMoney(metrics?.received_amount ?? 0, "BRL"),
      icon: Wallet,
    },
    {
      label: "Saldo pendente",
      value: formatMoney(metrics?.pending_balance ?? 0, "BRL"),
      icon: CalendarClock,
    },
  ];

  return (
    <div>
      <SupabaseSetupBanner />

      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
            {t("nav.dashboard")}
          </p>
          <h1 className="mt-1 text-3xl">Visão geral</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Métricas do mês corrente. Filtros e gráficos completos na próxima entrega.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="font-display text-2xl font-semibold">{c.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Próximos passos da implementação</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <ArrowUpRight className="mt-0.5 h-4 w-4 text-accent" />
              CRUD completo de Reservas (wizard, edição, exclusão admin)
            </li>
            <li className="flex items-start gap-2">
              <ArrowUpRight className="mt-0.5 h-4 w-4 text-accent" />
              Upload de nota fiscal + geração de contrato PDF
            </li>
            <li className="flex items-start gap-2">
              <ArrowUpRight className="mt-0.5 h-4 w-4 text-accent" />
              Logística mensal com filtros e agrupamento por dia
            </li>
            <li className="flex items-start gap-2">
              <ArrowUpRight className="mt-0.5 h-4 w-4 text-accent" />
              Envio Resend via Edge Function + histórico de e-mails
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
