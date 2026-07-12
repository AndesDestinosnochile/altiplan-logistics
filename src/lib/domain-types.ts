// Domain enums shared across the app. These are duplicated in the SQL migration
// as PostgreSQL enums (public.app_role, etc.) and should stay in sync.
export type AppRole = "admin" | "seller" | "logistics";
export type Currency = "BRL" | "CLP";
export type FinancialStatus = "paid" | "partial" | "pending";
export type PaymentMethod = "pix" | "card" | "cash" | "transfer" | "other";
export type TourStatus = "confirmed" | "pending" | "cancelled";
export type DocumentKind = "contract" | "invoice" | "receipt" | "other";

export const ROLE_LABEL: Record<AppRole, { pt: string; es: string }> = {
  admin: { pt: "Administrador", es: "Administrador" },
  seller: { pt: "Vendedor", es: "Vendedor" },
  logistics: { pt: "Logística", es: "Logística" },
};
