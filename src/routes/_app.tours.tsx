import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/lib/domain-types";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/_app/tours")({
  component: ToursPage,
});

interface Tour {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  currency: Currency;
  active: boolean;
}

const empty: Omit<Tour, "id"> = {
  name: "",
  description: "",
  default_price: 0,
  currency: "BRL",
  active: true,
};

function ToursPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tour | null>(null);
  const [form, setForm] = useState<Omit<Tour, "id">>(empty);
  const [saving, setSaving] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["tours_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tours_catalog")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Tour[];
    },
  });

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(t: Tour) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      default_price: Number(t.default_price),
      currency: t.currency,
      active: t.active,
    });
    setOpen(true);
  }
  async function save() {
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    try {
      const payload = { ...form, description: form.description || null };
      if (editing) {
        const { error } = await supabase.from("tours_catalog").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Passeio atualizado");
      } else {
        const { error } = await supabase.from("tours_catalog").insert(payload);
        if (error) throw error;
        toast.success("Passeio criado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["tours_catalog"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  }
  async function remove(t: Tour) {
    if (!confirm(`Excluir ${t.name}?`)) return;
    const { error } = await supabase.from("tours_catalog").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["tours_catalog"] });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Catálogo</p>
          <h1 className="mt-1 text-3xl">Passeios</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo passeio</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 text-right font-medium">Preço padrão</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>}
              {!isLoading && data.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">Nenhum passeio cadastrado.</td></tr>}
              {data.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(t.default_price, t.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar passeio" : "Novo passeio"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5"><Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5"><Label>Descrição</Label>
              <Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Preço padrão</Label>
                <Input type="number" step="0.01" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5"><Label>Moeda</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                  <option value="BRL">BRL</option>
                  <option value="CLP">CLP</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
