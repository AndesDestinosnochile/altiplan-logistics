
# Andes Destinos — Plano de Arquitetura

## Bloqueios antes de codar
1. **Logo oficial** (PNG/SVG) — extrair paleta e tipografia para o design system.
2. **Contrato oficial** (PDF/DOCX) — identificar cada variável (`{{nome}}`, `{{cpf}}`, `{{passeios}}`, etc.) para o gerador de PDF sem alterar o texto jurídico.
3. **Credenciais Supabase** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) do seu projeto — o sistema NÃO usará Lovable Cloud.
4. **Resend**: domínio verificado + API key (`RESEND_API_KEY`), e-mail remetente oficial da agência.
5. **Google Maps API key** (opcional agora, mas necessária para autocomplete de hotel/endereço).

Enquanto estes chegam, sigo com scaffolding, schema, RLS, UI e componentes reutilizáveis. O contrato PDF e envio de e-mail ficam prontos como esqueleto e só ligam quando você entregar o modelo/keys.

## Stack
React 19 + TypeScript + Vite + TanStack Start (já provisionado), Tailwind v4 + Shadcn/UI, TanStack Query, React Hook Form + Zod, Lucide, date-fns, react-day-picker, react-pdf/pdf-lib, i18next (PT/ES), dinero.js (BRL/CLP).

Cliente Supabase próprio em `src/integrations/supabase/client.ts` lendo `import.meta.env.VITE_SUPABASE_*`. Edge Functions em `supabase/functions/*` versionadas no repo.

## Estrutura de pastas
```text
src/
  routes/                      (TanStack file-based)
    _auth/                     login, recuperar senha
    _app/                      layout autenticado (sidebar + topbar)
      dashboard.tsx
      reservations.index.tsx
      reservations.new.tsx
      reservations.$id.tsx
      logistics.tsx            (visão mensal + agrupamento por dia)
      calendar.tsx
      customers.index.tsx
      hotels.index.tsx
      reports.tsx
      settings.*.tsx
      users.tsx                (admin cria vendedores)
  components/
    ui/                        (shadcn)
    layout/  forms/  reservations/  logistics/  calendar/
    financial/  documents/  dashboard/  common/
  features/                    (hooks + queries por domínio)
    auth/  reservations/  tours/  payments/ documents/ emails/ audit/
  lib/                         supabase, i18n, currency, pdf, zod schemas
  types/                       DB types gerados
supabase/
  migrations/                  SQL versionado
  functions/
    generate-contract/         (renderiza PDF do contrato)
    send-reservation-email/    (Resend + anexos do Storage)
    audit-log/                 (trigger auxiliar se necessário)
```

## Modelo de dados (migrations)
- `profiles` (id=auth.uid, full_name, phone, locale, avatar_url)
- `user_roles` (user_id, role: `admin`|`seller`) — tabela separada + função `has_role()` SECURITY DEFINER (evita recursão em RLS)
- `customers` (nome, cpf, telefone, whatsapp, email, nacionalidade, obs)
- `hotels` (nome, endereço, número, complemento, cidade, lat/lng)
- `reservations` (customer_id, hotel_id, check_in, check_out, pax, currency, total, paid, balance gerado, status financeiro, seller_id, created_by, dates)
- `tours_catalog` (nome, descrição, valor padrão) — para reuso
- `reservation_tours` (reservation_id, tour_name, data, pax, unit_price, total, status)
- `payments` (reservation_id, valor, método, data, comprovante_id)
- `documents` (reservation_id, tipo: contrato|nota_fiscal|comprovante|outro, storage_path, mime, size, uploaded_by)
- `contracts` (reservation_id, versão, storage_path, gerado_em, gerado_por)
- `email_logs` (reservation_id, to, subject, status, provider_id, sent_by, sent_at, error)
- `audit_logs` (table_name, row_id, action, actor_id, diff jsonb, created_at) — populado por trigger genérico
- Buckets Storage: `contracts` (privado), `invoices` (privado), `receipts` (privado), `misc` (privado). Acesso via URLs assinadas.

**RLS**: admin vê tudo via `has_role(auth.uid(),'admin')`; vendedor lê/edita apenas onde `seller_id = auth.uid()`; nunca DELETE para seller.

## Fluxos-chave
- **Reserva**: wizard 4 passos (Passageiro → Hospedagem → Passeios → Financeiro). Autosave draft. Ao salvar, calcula saldo/percentual client-side e persiste via RPC transacional.
- **Contrato**: Edge Function `generate-contract` recebe `reservation_id`, monta objeto, faz merge no template (usaremos `pdf-lib` com AcroForm OU template HTML + Puppeteer-lite; escolha depende do formato do contrato que você enviar), salva em `contracts` bucket, insere linha em `contracts`, retorna URL assinada.
- **Nota fiscal**: upload PDF direto para bucket `invoices` (client), registra em `documents`.
- **Envio e-mail**: Edge Function `send-reservation-email` baixa anexos via signed URL, chama Resend, grava `email_logs`. Nunca expõe API key.
- **Auditoria**: trigger `audit_trigger()` em tabelas críticas grava diff em `audit_logs`.
- **Logística**: query agregada por mês/dia com filtros; tabela densa com colunas fixadas + agrupamento por data.
- **Calendário**: mesma query alimentando view mensal (react-day-picker) + drawer diário.
- **Dashboard**: RPCs `dashboard_metrics(range)` + `sales_by_seller`, `sales_by_tour`, `sales_by_month`. Gráficos com Recharts.

## Segurança
- Sem service_role no client.
- Todas operações sensíveis (gerar contrato, enviar e-mail, criar vendedor) via Edge Function autenticada.
- Zod em todos os forms e nas Edge Functions.
- Signed URLs de 5 min para downloads.
- Rate limit básico nas Edge Functions.

## Internacionalização e moeda
- i18next com namespaces (`common`, `reservations`, `logistics`…), PT-BR padrão, ES-CL alternativo por usuário (`profiles.locale`).
- Moeda por reserva (`BRL`|`CLP`) com formatação via `Intl.NumberFormat`.

## Deploy
- Netlify: build `bun run build`, publish `dist/`. Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Edge Functions rodam no Supabase (`supabase functions deploy`). Segredos: `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`, `APP_URL`.

## Ordem de implementação (single push)
1. Design system a partir da logo + i18n + layout autenticado
2. Cliente Supabase + tipos + migrations completas + RLS + seeds mínimos (roles)
3. Auth (login, sessão, guard, criação de vendedor por admin)
4. CRUD Reservas (wizard + listagem + detalhe + edição + histórico)
5. Passeios, financeiro (cálculo saldo/%), pagamentos
6. Documentos (upload NF, comprovantes)
7. Edge Function contrato + botões PDF (visualizar/baixar/regenerar)
8. Edge Function envio Resend + `email_logs`
9. Logística mensal/diária + filtros/pesquisa global
10. Calendário
11. Dashboard + relatórios
12. Configurações (perfil, usuários, hotéis, catálogo de passeios)
13. Auditoria + polimentos

## O que preciso de você AGORA para destravar
- **Logo** (arquivo)
- **Contrato oficial** (arquivo)
- **URL + anon key** do Supabase que você criou
- **API key da Resend** + domínio remetente
- Confirmação: usar Google Maps agora? (se sim, preciso da key)

Assim que você aprovar o plano e enviar a logo + contrato + credenciais, começo a implementação imediatamente na ordem acima.
