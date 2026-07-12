import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Trash2, Plus, FileText, Download, Loader2, RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, paidPercent } from "@/lib/currency";
import type { Currency, PaymentMethod, TourStatus } from "@/lib/domain-types";
import { generateContract, uploadDocument, getSignedUrl } from "@/features/documents/documents-service";

export const Route = createFileRoute("/_app/reservations/$id")({
  component: ReservationDetailPage,
});

function ReservationDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();

  const { data: reservation, isLoading } = useQuery({
    queryKey: ["reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(`
          *,
          customer:customers(*),
          hotel:hotels(id,name,address,city),
          tours:reservation_tours(*),
          payments(*),
          documents(*),
          contracts(id,version,storage_path,generated_at)
        `)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: hotels = [] } = useQuery({
    queryKey: ["hotels-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("hotels").select("id,name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);

  // sync form when data arrives
  if (reservation && !form) {
    setForm({
      total_amount: Number(reservation.total_amount),
      currency: reservation.currency,
      check_in: reservation.check_in ?? "",
      check_out: reservation.check_out ?? "",
      reservation_date: reservation.reservation_date,
      hotel_id: reservation.hotel_id ?? "",
      notes: reservation.notes ?? "",
      customer_name: reservation.customer?.full_name ?? "",
      customer_phone: reservation.customer?.phone ?? "",
      customer_email: reservation.customer?.email ?? "",
      customer_cpf: reservation.customer?.cpf ?? "",
      customer_pax: reservation.customer?.pax_count ?? 1,
    });
  }

  if (isLoading || !reservation || !form) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando reserva…
      </div>
    );
  }

  async function saveReservation() {
    setSaving(true);
    try {
      const { error: cErr } = await supabase.from("customers").update({
        full_name: form.customer_name,
        phone: form.customer_phone || null,
        email: form.customer_email || null,
        cpf: form.customer_cpf || null,
        pax_count: Number(form.customer_pax) || 1,
      }).eq("id", reservation.customer.id);
      if (cErr) throw cErr;

      const { error } = await supabase.from("reservations").update({
        total_amount: Number(form.total_amount),
        currency: form.currency,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        reservation_date: form.reservation_date,
        hotel_id: form.hotel_id || null,
        notes: form.notes || null,
      }).eq("id", id);
      if (error) throw error;

      // recompute totals (in case total changed relative to payments)
      await supabase.rpc("recompute_reservation_totals", { _reservation_id: id });
      toast.success("Reserva atualizada");
      qc.invalidateQueries({ queryKey: ["reservation", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReservation() {
    if (!confirm(`Excluir reserva ${reservation.code}? Esta ação é irreversível.`)) return;
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Reserva excluída");
    navigate({ to: "/reservations" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/reservations"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          </Button>
          <h1 className="text-3xl">
            Reserva <span className="font-mono text-2xl text-muted-foreground">{reservation.code}</span>
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Badge variant={reservation.financial_status === "paid" ? "default" : reservation.financial_status === "partial" ? "secondary" : "destructive"}>
              {reservation.financial_status === "paid" ? "Pago" : reservation.financial_status === "partial" ? "Parcial" : "Pendente"}
            </Badge>
            <span className="text-muted-foreground">
              {formatMoney(reservation.paid_amount, reservation.currency)} / {formatMoney(reservation.total_amount, reservation.currency)} ({paidPercent(reservation.total_amount, reservation.paid_amount)}%)
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveReservation} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
          {isAdmin && (
            <Button variant="destructive" onClick={deleteReservation}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Passageiro</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label="Nome"><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></F>
          <F label="CPF / Documento"><Input value={form.customer_cpf} onChange={(e) => setForm({ ...form, customer_cpf: e.target.value })} /></F>
          <F label="E-mail"><Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></F>
          <F label="Telefone"><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></F>
          <F label="Passageiros"><Input type="number" min={1} value={form.customer_pax} onChange={(e) => setForm({ ...form, customer_pax: e.target.value })} /></F>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reserva</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label="Data da reserva"><Input type="date" value={form.reservation_date} onChange={(e) => setForm({ ...form, reservation_date: e.target.value })} /></F>
          <F label="Moeda">
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
              <option value="BRL">BRL</option><option value="CLP">CLP</option>
            </select>
          </F>
          <F label="Check-in"><Input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></F>
          <F label="Check-out"><Input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></F>
          <F label="Hotel">
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.hotel_id} onChange={(e) => setForm({ ...form, hotel_id: e.target.value })}>
              <option value="">— sem hotel —</option>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </F>
          <F label="Valor total"><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></F>
          <div className="sm:col-span-2"><F label="Observações"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F></div>
        </CardContent>
      </Card>

      <ToursSection reservationId={id} currency={reservation.currency} tours={reservation.tours ?? []} onChange={() => qc.invalidateQueries({ queryKey: ["reservation", id] })} />
      <PaymentsSection reservationId={id} currency={reservation.currency} payments={reservation.payments ?? []} userId={user?.id ?? ""} onChange={() => qc.invalidateQueries({ queryKey: ["reservation", id] })} />
      <DocumentsSection reservationId={id} documents={reservation.documents ?? []} contracts={reservation.contracts ?? []} onChange={() => qc.invalidateQueries({ queryKey: ["reservation", id] })} />
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

// ─── Passeios ───────────────────────────────────────────────────────────────
function ToursSection({ reservationId, currency, tours, onChange }: {
  reservationId: string; currency: Currency; tours: any[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: "", tour_date: "", pax: 1, unit_price: 0, status: "pending" as TourStatus, notes: "" });
  const [catalog, setCatalog] = useState<any[]>([]);

  async function openNew() {
    setEditing(null);
    setForm({ name: "", tour_date: "", pax: 1, unit_price: 0, status: "pending", notes: "" });
    const { data } = await supabase.from("tours_catalog").select("id,name,default_price").eq("active", true).order("name");
    setCatalog(data ?? []);
    setOpen(true);
  }
  function openEdit(t: any) {
    setEditing(t);
    setForm({ name: t.name, tour_date: t.tour_date, pax: t.pax, unit_price: Number(t.unit_price), status: t.status, notes: t.notes ?? "" });
    setOpen(true);
  }
  async function save() {
    if (!form.name || !form.tour_date) return toast.error("Nome e data obrigatórios");
    const payload = { ...form, pax: Number(form.pax), unit_price: Number(form.unit_price), reservation_id: reservationId, notes: form.notes || null };
    const { error } = editing
      ? await supabase.from("reservation_tours").update(payload).eq("id", editing.id)
      : await supabase.from("reservation_tours").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo"); setOpen(false); onChange();
  }
  async function remove(t: any) {
    if (!confirm(`Excluir passeio ${t.name}?`)) return;
    const { error } = await supabase.from("reservation_tours").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Passeios ({tours.length})</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" /> Adicionar</Button>
      </CardHeader>
      <CardContent>
        {tours.length === 0 && <p className="text-sm text-muted-foreground">Nenhum passeio.</p>}
        <div className="divide-y">
          {tours.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.tour_date} · {t.pax} pax · {formatMoney(t.unit_price, currency)} un · total {formatMoney(t.total_price, currency)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.status === "confirmed" ? "default" : t.status === "pending" ? "secondary" : "destructive"}>{t.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar passeio" : "Novo passeio"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {!editing && catalog.length > 0 && (
              <F label="Do catálogo">
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(e) => {
                    const c = catalog.find((x) => x.id === e.target.value);
                    if (c) setForm({ ...form, name: c.name, unit_price: Number(c.default_price) });
                  }}>
                  <option value="">— selecione —</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>
            )}
            <F label="Nome *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Data *"><Input type="date" value={form.tour_date} onChange={(e) => setForm({ ...form, tour_date: e.target.value })} /></F>
              <F label="Pax"><Input type="number" min={1} value={form.pax} onChange={(e) => setForm({ ...form, pax: e.target.value })} /></F>
              <F label="Preço unitário"><Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></F>
              <F label="Status">
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">Pendente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </F>
            </div>
            <F label="Observações"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Pagamentos ─────────────────────────────────────────────────────────────
function PaymentsSection({ reservationId, currency, payments, userId, onChange }: {
  reservationId: string; currency: Currency; payments: any[]; userId: string; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: 0, method: "pix" as PaymentMethod, paid_at: new Date().toISOString().slice(0, 10), reference: "" });

  async function save() {
    if (!form.amount || form.amount <= 0) return toast.error("Valor inválido");
    const { error } = await supabase.from("payments").insert({
      reservation_id: reservationId,
      amount: Number(form.amount),
      method: form.method,
      paid_at: form.paid_at,
      reference: form.reference || null,
      created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Pagamento adicionado"); setOpen(false); onChange();
    setForm({ amount: 0, method: "pix", paid_at: new Date().toISOString().slice(0, 10), reference: "" });
  }
  async function remove(p: any) {
    if (!confirm("Excluir pagamento?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Pagamentos ({payments.length})</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Adicionar</Button>
      </CardHeader>
      <CardContent>
        {payments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>}
        <div className="divide-y">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{formatMoney(p.amount, currency)} <span className="ml-2 text-xs uppercase text-muted-foreground">{p.method}</span></div>
                <div className="text-xs text-muted-foreground">{p.paid_at}{p.reference ? ` · ${p.reference}` : ""}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo pagamento</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Valor"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></F>
            <F label="Método">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
                <option value="pix">Pix</option>
                <option value="card">Cartão</option>
                <option value="cash">Dinheiro</option>
                <option value="transfer">Transferência</option>
                <option value="other">Outro</option>
              </select>
            </F>
            <F label="Data"><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></F>
            <F label="Referência"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Documentos e contrato ──────────────────────────────────────────────────
function DocumentsSection({ reservationId, documents, contracts, onChange }: {
  reservationId: string; documents: any[]; contracts: any[]; onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"invoice" | "receipt" | "other">("invoice");
  const [busy, setBusy] = useState(false);
  const [contractBusy, setContractBusy] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadDocument({ reservationId, kind, file });
      toast.success("Documento enviado");
      onChange();
    } catch (err: any) {
      toast.error(err.message ?? "Erro no upload");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openDoc(bucket: "contracts" | "invoices" | "receipts" | "misc", path: string) {
    try {
      const url = await getSignedUrl(bucket, path);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  async function makeContract(force = false) {
    setContractBusy(true);
    try {
      const res = await generateContract(reservationId, { force });
      toast.success(res.reused ? "Contrato reutilizado" : `Contrato v${res.version} gerado`);
      if (res.signed_url) window.open(res.signed_url, "_blank");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar contrato");
    } finally { setContractBusy(false); }
  }

  const invoices = documents.filter((d) => d.kind === "invoice");
  const receipts = documents.filter((d) => d.kind === "receipt");
  const others = documents.filter((d) => d.kind === "other");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Documentos e contrato</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Contract */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> Contrato PDF</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => makeContract(false)} disabled={contractBusy}>
                {contractBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Gerar / abrir
              </Button>
              <Button size="sm" variant="outline" onClick={() => makeContract(true)} disabled={contractBusy}>
                <RefreshCw className="h-4 w-4" /> Nova versão
              </Button>
            </div>
          </div>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contrato gerado.</p>
          ) : (
            <div className="divide-y text-sm">
              {contracts.sort((a, b) => b.version - a.version).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>v{c.version} — {new Date(c.generated_at).toLocaleString("pt-BR")}</div>
                  <Button size="sm" variant="ghost" onClick={() => openDoc("contracts", c.storage_path)}>
                    <Download className="h-4 w-4" /> Abrir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="font-medium">Adicionar documento</div>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="invoice">Nota fiscal</option>
              <option value="receipt">Comprovante</option>
              <option value="other">Outro</option>
            </select>
            <input ref={fileRef} type="file" onChange={onUpload} disabled={busy}
              accept="application/pdf,image/*" className="text-sm" />
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>

          <DocList title="Notas fiscais" bucket="invoices" items={invoices} onOpen={openDoc} onDeleted={onChange} />
          <DocList title="Comprovantes" bucket="receipts" items={receipts} onOpen={openDoc} onDeleted={onChange} />
          <DocList title="Outros" bucket="misc" items={others} onOpen={openDoc} onDeleted={onChange} />
        </div>
      </CardContent>
    </Card>
  );
}

function DocList({ title, bucket, items, onOpen, onDeleted }: {
  title: string; bucket: "contracts" | "invoices" | "receipts" | "misc";
  items: any[]; onOpen: (b: any, p: string) => void; onDeleted: () => void;
}) {
  if (items.length === 0) return null;
  async function remove(doc: any) {
    if (!confirm(`Excluir ${doc.file_name}?`)) return;
    await supabase.storage.from(bucket).remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    onDeleted();
  }
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="divide-y text-sm">
        {items.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0 flex-1 truncate">{d.file_name}</div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onOpen(bucket, d.storage_path)}><Download className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
