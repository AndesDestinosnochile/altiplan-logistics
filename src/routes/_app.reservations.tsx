import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SupabaseSetupBanner } from "@/components/common/supabase-setup-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { supabase, SUPABASE_CONFIGURED } from "@/integrations/supabase/client";
import { formatMoney, paidPercent } from "@/lib/currency";
import type { Currency, FinancialStatus } from "@/lib/domain-types";

export const Route = createFileRoute("/_app/reservations")({
  component: ReservationsPage,
});

interface ReservationRow {
  id: string;
  code: string;
  currency: Currency;
  total_amount: number;
  paid_amount: number;
  balance: number;
  financial_status: FinancialStatus;
  check_in: string | null;
  check_out: string | null;
  reservation_date: string;
  customers: { full_name: string; phone: string | null } | null;
}

const STATUS_LABEL: Record<FinancialStatus, string> = {
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
};
const STATUS_VARIANT: Record<FinancialStatus, "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  pending: "destructive",
};

function ReservationsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["reservations", search],
    enabled: SUPABASE_CONFIGURED,
    queryFn: async () => {
      let q = supabase
        .from("reservations")
        .select(
          "id, code, currency, total_amount, paid_amount, balance, financial_status, check_in, check_out, reservation_date, customers(full_name, phone)",
        )
        .order("reservation_date", { ascending: false })
        .limit(50);
      if (search) q = q.ilike("code", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ReservationRow[];
    },
  });

  async function remove(r: ReservationRow) {
    if (!confirm(`Excluir reserva ${r.code}?`)) return;
    const { error } = await supabase.from("reservations").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Reserva excluída");
    qc.invalidateQueries({ queryKey: ["reservations"] });
  }

  return (
    <div>
      <SupabaseSetupBanner />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
            {t("nav.reservations")}
          </p>
          <h1 className="mt-1 text-3xl">{t("reservations.title")}</h1>
        </div>
        <Button asChild>
          <Link to="/reservations/new">
            <Plus className="h-4 w-4" />
            {t("reservations.new")}
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("reservations.code")}</th>
                <th className="px-4 py-3 font-medium">{t("reservations.customer")}</th>
                <th className="px-4 py-3 font-medium">{t("reservations.checkIn")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("reservations.total")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("reservations.paid")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("reservations.balance")}</th>
                <th className="px-4 py-3 font-medium">{t("reservations.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("common.loading")}
                  </td>
                </tr>
              )}
              {!isLoading && data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {t("reservations.empty")}
                  </td>
                </tr>
              )}
              {data.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.customers?.full_name ?? "—"}</div>
                    {r.customers?.phone && (
                      <div className="text-xs text-muted-foreground">{r.customers.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.check_in ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMoney(r.total_amount, r.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMoney(r.paid_amount, r.currency)}
                    <div className="text-xs text-muted-foreground">
                      {paidPercent(r.total_amount, r.paid_amount)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMoney(r.balance, r.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.financial_status]}>
                      {STATUS_LABEL[r.financial_status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
