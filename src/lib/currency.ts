import type { Currency } from "@/lib/domain-types";

export function formatMoney(amount: number | null | undefined, currency: Currency = "BRL", locale = "pt-BR") {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat(locale === "es-CL" ? "es-CL" : "pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(value);
}

export function paidPercent(total: number, paid: number) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((paid / total) * 100));
}
