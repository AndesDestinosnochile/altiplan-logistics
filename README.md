# Andes Destinos — Central de Operações

Sistema SaaS para operação diária da agência (reservas, passageiros, logística, financeiro, contratos, e-mail).

## Stack

React 19 · TypeScript · Vite · TanStack Router/Query/Start · Tailwind v4 · Shadcn/UI · React Hook Form · Zod · Supabase (Auth + Postgres + Storage + Edge Functions) · Resend · pdf-lib.

## Setup — seu próprio Supabase

1. **Crie um projeto** em https://supabase.com (região São Paulo recomendada).

2. **Aplique as migrations** em `db/migrations/` (na ordem numérica):
   ```bash
   supabase link --project-ref <SEU-REF>
   psql "$(supabase db url)" -f db/migrations/0001_init.sql
   psql "$(supabase db url)" -f db/migrations/0002_storage_optimization.sql
   psql "$(supabase db url)" -f db/migrations/0003_logistics_role.sql
   ```

3. **Configure o `.env`** (já preenchido em `.env` com as credenciais do seu projeto):
   ```
   VITE_SUPABASE_URL=https://ctnjqdrjqfxlczfwrvva.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

4. **Papéis (roles).** O signup em `/login → Criar conta` cria contas de
   `seller` (vendedor) ou `logistics` (logística). O papel `admin` é sempre
   promovido manualmente — jamais via signup:
   ```sql
   insert into public.user_roles(user_id, role)
   values ((select id from auth.users where email = 'voce@empresa.com'), 'admin');
   ```
   Regras de visibilidade:
   - **admin**: vê e gerencia tudo (inclusive `/users`, `/reports`).
   - **logistics**: vê todas as reservas/tours/pagamentos (leitura) para
     organizar passageiros por dia/mês/passeio.
   - **seller**: cria e gerencia apenas as próprias reservas.

5. **Confirmação por e-mail.** Durante os testes iniciais, desative a
   confirmação em Supabase → Authentication → Providers → Email
   (*Confirm email* = off) para que vendedores criados no signup entrem
   imediatamente. Reative depois de configurar o domínio de e-mail.


5. **Edge Functions.**
   ```bash
   supabase functions deploy generate-contract
   supabase functions deploy store-document
   supabase functions deploy send-reservation-email

   supabase secrets set \
     RESEND_API_KEY=re_xxx \
     SENDER_EMAIL=reservas@andesdestinos.com \
     SENDER_NAME="Andes Destinos" \
     BRAND_LOGO_URL="https://<seu-dominio>/logo-pdf.jpg"
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são
   injetados pela plataforma nas Edge Functions.

## Otimização de armazenamento

O sistema é agressivo em economia de espaço no seu bucket Supabase:

### Contratos (PDF)
- Fonte **Helvetica standard** (não-embutida) → arquivos tipicamente < 30 KB.
- Logo pré-processada em JPG 500 px (≈ 23 KB), reutilizada por toda a instância.
- Metadados (autor/produtor/keywords) removidos.
- `useObjectStreams: true` na serialização final.
- **Regeneração condicional:** o hash SHA-256 do payload da reserva é gravado
  em `contracts.data_hash`. Se nada mudou, a Edge Function reutiliza o contrato
  existente e devolve uma signed URL — sem uploads duplicados nem versões novas.
- Ao mudar dados da reserva, uma nova `version` é gravada e o arquivo antigo
  fica preservado para auditoria.

### Notas fiscais / recibos
- Upload PDF → recarregado via pdf-lib com metadados strippados e
  reserializado (só mantém o arquivo original se ficar menor).
- Upload JPG/PNG → embutido em um PDF A4 comprimido de 1 página.
- Upload HEIC → conversão automática para JPEG no navegador (`heic2any`) antes
  do envio (Deno não decodifica HEIC nativamente).
- **Dedup por hash de conteúdo:** `documents.content_hash` (SHA-256). Se o mesmo
  arquivo já existir em qualquer reserva, o novo registro aponta para o
  storage_path existente — nenhum byte extra é gravado no bucket.

## Comandos

```bash
bun install
bun run dev
bun run build
```

## Deploy (Netlify)

- Build command: `bun run build`
- Publish dir: `dist/`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Estrutura

```
db/migrations/                    SQL versionado
supabase/functions/
  _shared/                        helpers (cors, supabase client, pdf)
  generate-contract/              gera contrato (dedup por data_hash)
  store-document/                 upload otimizado (PDF/imagem, dedup por content_hash)
  send-reservation-email/         Resend + anexo do contrato
src/
  routes/                         TanStack file-based
  features/                       hooks e services por domínio
  components/                     UI (shadcn + composições)
  integrations/supabase/          cliente
  lib/                            i18n, currency, utils
```
