import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/features/auth/auth-context";
import { supabase, SUPABASE_CONFIGURED } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    if (!SUPABASE_CONFIGURED) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, configured } = useAuth();
  useEffect(() => {
    if (configured && !loading && !session) {
      window.location.href = "/login";
    }
  }, [loading, session, configured]);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
