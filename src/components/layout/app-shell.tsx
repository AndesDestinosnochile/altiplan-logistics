import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  CalendarDays,
  Users,
  Building2,
  Compass,
  BarChart3,
  UserCog,
  Settings,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LogoBadge } from "@/components/brand/logo";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/domain-types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  hideForLogistics?: boolean;
  hideForSeller?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/reservations", label: "Reservas", icon: ClipboardList },
  { to: "/logistics", label: "Logística", icon: MapPin, hideForSeller: true },
  { to: "/calendar", label: "Calendário", icon: CalendarDays },
  { to: "/customers", label: "Passageiros", icon: Users },
  { to: "/hotels", label: "Hotéis", icon: Building2 },
  { to: "/tours", label: "Passeios", icon: Compass },
  { to: "/reports", label: "Relatórios", icon: BarChart3, adminOnly: true },
  { to: "/users", label: "Usuários", icon: UserCog, adminOnly: true },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { isAdmin, isLogistics, isSeller, roles, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = NAV.filter((n) => {
    if (n.adminOnly && !isAdmin) return false;
    if (n.hideForLogistics && isLogistics && !isAdmin) return false;
    if (n.hideForSeller && isSeller && !isAdmin && !isLogistics) return false;
    return true;
  });

  const primaryRole = isAdmin ? "admin" : isLogistics ? "logistics" : roles[0] ?? "seller";
  const lang = i18n.language ?? "pt-BR";
  const roleLabel = ROLE_LABEL[primaryRole][lang.startsWith("es") ? "es" : "pt"];

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        {/* Brand */}
        <div className="flex h-24 items-center gap-3 border-b border-sidebar-border px-5">
          <LogoBadge size={44} tone="dark" />
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight text-white">Andes Destinos</p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/60">
              Central de Operações
            </p>
          </div>
        </div>





        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            const active =
              location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-accent/15 text-white shadow-[inset_2px_0_0_var(--color-accent)]"
                    : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-accent" : "text-sidebar-foreground/60 group-hover:text-accent",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-white/5 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-medium text-accent">
              {(user?.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">{user?.email}</p>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
                {roleLabel}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
