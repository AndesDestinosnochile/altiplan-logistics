import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Compass, MapPin, ShieldCheck } from "lucide-react";

import { LogoBadge } from "@/components/brand/logo";
import { SupabaseSetupBanner } from "@/components/common/supabase-setup-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-context";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) return toast.error(t("auth.invalidCredentials"));
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* LEFT — brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 40% at 15% 8%, oklch(0.68 0.14 45 / 0.45), transparent 65%), radial-gradient(ellipse 55% 45% at 90% 95%, oklch(0.45 0.10 220 / 0.55), transparent 60%), radial-gradient(ellipse 40% 30% at 70% 20%, oklch(0.35 0.08 280 / 0.4), transparent 60%)",
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 1200 400"
          className="absolute inset-x-0 bottom-0 h-64 w-full text-sidebar/90"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0 400V240l120-90 100 60 140-140 130 100 90-70 130 130 110-80 160 130 120-100 100 80v140z"
          />
        </svg>

        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-4">
            <LogoBadge size={64} tone="dark" />
            <div>
              <p className="font-display text-2xl leading-none text-white">Andes Destinos</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-sidebar-foreground/60">
                Chile · Turismo
              </p>
            </div>
          </div>

          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.28em] text-sidebar-foreground/80 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Central de Operações
            </p>
            <h2 className="font-display text-5xl font-medium leading-[1.05] tracking-tight text-white">
              A operação da sua agência,
              <br />
              <span className="text-accent">organizada em um só lugar.</span>
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-sidebar-foreground/70">
              Reservas, passageiros, financeiro, contratos e logística — tudo em um único fluxo elegante e rápido.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <FeaturePill icon={Compass} title="Reservas em minutos" body="Wizard rápido, contratos automáticos." />
              <FeaturePill icon={MapPin} title="Logística por dia" body="Passageiros organizados por passeio." />
            </div>
          </div>

          <p className="text-xs text-sidebar-foreground/50">© Andes Destinos · Chile</p>
        </div>
      </div>

      {/* RIGHT — sign-in only */}
      <div className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoBadge size={48} tone="light" />
            <div>
              <p className="font-display text-lg leading-none">Andes Destinos</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Central de Operações
              </p>
            </div>
          </div>

          <SupabaseSetupBanner />

          <div className="mb-6 hidden lg:flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Acesso restrito à equipe
          </div>

          <h1 className="font-display text-3xl">Acessar sistema</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use suas credenciais internas. Novos acessos são criados pelo administrador.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <IconField id="email" label="E-mail" icon={Mail}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </IconField>
            <IconField id="password" label="Senha" icon={Lock}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
            </IconField>
            <Button type="submit" className="w-full h-11" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Esqueceu sua senha? Fale com o administrador.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Compass;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/20 text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs text-sidebar-foreground/60">{body}</p>
    </div>
  );
}

function IconField({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </div>
  );
}
