import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/domain-types";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

interface Profile { id: string; full_name: string; active: boolean }

function UsersPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,active").order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id,role");
      return (data ?? []) as { user_id: string; role: AppRole }[];
    },
  });

  const rolesOf = (id: string) => roles.filter((r) => r.user_id === id).map((r) => r.role);

  async function toggleRole(userId: string, role: AppRole, has: boolean) {
    if (!isAdmin) return toast.error("Apenas admin");
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Equipe</p>
        <h1 className="mt-1 text-3xl">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Clique nas funções para conceder ou remover." : "Somente administradores podem editar funções."}
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Funções</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>}
            {profiles.map((p) => {
              const rs = rolesOf(p.id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.full_name || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(["admin","seller","logistics"] as AppRole[]).map((r) => {
                        const has = rs.includes(r);
                        return (
                          <Button key={r} size="sm" variant={has ? "default" : "outline"}
                            disabled={!isAdmin}
                            onClick={() => toggleRole(p.id, r, has)}>
                            {r}
                          </Button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
