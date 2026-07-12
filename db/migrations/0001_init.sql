-- =============================================================================
-- Andes Destinos — Initial schema
-- Apply to YOUR Supabase project:
--   supabase link --project-ref <your-ref>
--   supabase db push
-- or paste into Supabase SQL editor.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Enums --------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'seller');
exception when duplicate_object then null; end $$;
do $$ begin create type public.currency as enum ('BRL','CLP'); exception when duplicate_object then null; end $$;
do $$ begin create type public.financial_status as enum ('paid','partial','pending'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('pix','card','cash','transfer','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tour_status as enum ('confirmed','pending','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.document_kind as enum ('contract','invoice','receipt','other'); exception when duplicate_object then null; end $$;

-- Profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  locale text not null default 'pt-BR',
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Roles --------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'seller')
  on conflict (user_id, role) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hotels -------------------------------------------------------------------
create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  address_number text,
  address_complement text,
  city text,
  country text not null default 'Chile',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  place_id text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hotels_name_idx on public.hotels (name);
create index if not exists hotels_city_idx on public.hotels (city);
grant select, insert, update, delete on public.hotels to authenticated;
grant all on public.hotels to service_role;
alter table public.hotels enable row level security;

-- Tours catalog ------------------------------------------------------------
create table if not exists public.tours_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_price numeric(12, 2) not null default 0,
  currency public.currency not null default 'BRL',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tours_catalog to authenticated;
grant all on public.tours_catalog to service_role;
alter table public.tours_catalog enable row level security;

-- Customers ----------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cpf text,
  phone text,
  whatsapp text,
  email citext,
  nationality text,
  pax_count integer not null default 1 check (pax_count > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_name_idx on public.customers (full_name);
create index if not exists customers_cpf_idx on public.customers (cpf);
create index if not exists customers_email_idx on public.customers (email);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;

-- Reservations -------------------------------------------------------------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('AD-' || to_char(now(),'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4))),
  customer_id uuid not null references public.customers(id) on delete restrict,
  hotel_id uuid references public.hotels(id) on delete set null,
  hotel_snapshot jsonb,
  check_in date,
  check_out date,
  currency public.currency not null default 'BRL',
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  balance numeric(12, 2) generated always as (total_amount - paid_amount) stored,
  payment_method public.payment_method,
  financial_status public.financial_status not null default 'pending',
  reservation_date date not null default current_date,
  notes text,
  seller_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reservations_seller_idx on public.reservations (seller_id);
create index if not exists reservations_customer_idx on public.reservations (customer_id);
create index if not exists reservations_date_idx on public.reservations (reservation_date desc);
create index if not exists reservations_checkin_idx on public.reservations (check_in);
create index if not exists reservations_finstatus_idx on public.reservations (financial_status);
grant select, insert, update, delete on public.reservations to authenticated;
grant all on public.reservations to service_role;
alter table public.reservations enable row level security;

-- Reservation tours --------------------------------------------------------
create table if not exists public.reservation_tours (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  tour_catalog_id uuid references public.tours_catalog(id) on delete set null,
  name text not null,
  tour_date date not null,
  pax integer not null default 1 check (pax > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  total_price numeric(12, 2) generated always as (unit_price * pax) stored,
  status public.tour_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rt_reservation_idx on public.reservation_tours (reservation_id);
create index if not exists rt_date_idx on public.reservation_tours (tour_date);
create index if not exists rt_status_idx on public.reservation_tours (status);
grant select, insert, update, delete on public.reservation_tours to authenticated;
grant all on public.reservation_tours to service_role;
alter table public.reservation_tours enable row level security;

-- Payments -----------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method public.payment_method not null,
  paid_at date not null default current_date,
  reference text,
  receipt_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_reservation_idx on public.payments (reservation_id);
create index if not exists payments_date_idx on public.payments (paid_at desc);
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create or replace function public.recompute_reservation_totals(_reservation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _paid numeric(12,2); _total numeric(12,2);
begin
  select coalesce(sum(amount),0) into _paid from public.payments where reservation_id = _reservation_id;
  select total_amount into _total from public.reservations where id = _reservation_id;
  update public.reservations set
    paid_amount = _paid,
    financial_status = case
      when _paid = 0 then 'pending'::financial_status
      when _paid >= _total and _total > 0 then 'paid'::financial_status
      else 'partial'::financial_status end,
    updated_at = now()
    where id = _reservation_id;
end; $$;
create or replace function public.payments_after_change() returns trigger language plpgsql as $$
begin perform public.recompute_reservation_totals(coalesce(new.reservation_id, old.reservation_id)); return coalesce(new,old); end; $$;
drop trigger if exists payments_recompute_ai on public.payments;
drop trigger if exists payments_recompute_au on public.payments;
drop trigger if exists payments_recompute_ad on public.payments;
create trigger payments_recompute_ai after insert on public.payments for each row execute function public.payments_after_change();
create trigger payments_recompute_au after update on public.payments for each row execute function public.payments_after_change();
create trigger payments_recompute_ad after delete on public.payments for each row execute function public.payments_after_change();

-- Documents ----------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  kind public.document_kind not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists docs_reservation_idx on public.documents (reservation_id);
create index if not exists docs_kind_idx on public.documents (kind);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;

-- Contracts ----------------------------------------------------------------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  version integer not null default 1,
  storage_path text not null,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (reservation_id, version)
);
grant select, insert on public.contracts to authenticated;
grant all on public.contracts to service_role;
alter table public.contracts enable row level security;

-- Email logs ---------------------------------------------------------------
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  to_email text not null,
  subject text not null,
  body_preview text,
  status text not null default 'sent',
  provider_message_id text,
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists email_logs_reservation_idx on public.email_logs (reservation_id);
create index if not exists email_logs_sent_idx on public.email_logs (sent_at desc);
grant select, insert on public.email_logs to authenticated;
grant all on public.email_logs to service_role;
alter table public.email_logs enable row level security;

-- Audit logs ---------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_id uuid references auth.users(id) on delete set null,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_row_idx on public.audit_logs (table_name, row_id);
create index if not exists audit_created_idx on public.audit_logs (created_at desc);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

create or replace function public.audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare _row_id uuid; _diff jsonb;
begin
  if tg_op = 'DELETE' then _row_id := (old.id)::uuid; _diff := to_jsonb(old);
  elsif tg_op = 'INSERT' then _row_id := (new.id)::uuid; _diff := to_jsonb(new);
  else _row_id := (new.id)::uuid; _diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)); end if;
  insert into public.audit_logs(table_name, row_id, action, actor_id, diff)
    values (tg_table_name, _row_id, tg_op, auth.uid(), _diff);
  return coalesce(new, old);
end; $$;

drop trigger if exists audit_reservations on public.reservations;
drop trigger if exists audit_reservation_tours on public.reservation_tours;
drop trigger if exists audit_payments on public.payments;
drop trigger if exists audit_customers on public.customers;
drop trigger if exists audit_documents on public.documents;
create trigger audit_reservations after insert or update or delete on public.reservations for each row execute function public.audit_trigger();
create trigger audit_reservation_tours after insert or update or delete on public.reservation_tours for each row execute function public.audit_trigger();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit_trigger();
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.audit_trigger();
create trigger audit_documents after insert or update or delete on public.documents for each row execute function public.audit_trigger();

-- updated_at ---------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
do $$ declare t text;
begin
  foreach t in array array['profiles','hotels','tours_catalog','customers','reservations','reservation_tours']
  loop
    execute format('drop trigger if exists touch_updated_at_%1$s on public.%1$s;', t);
    execute format('create trigger touch_updated_at_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- RLS policies -------------------------------------------------------------
drop policy if exists "profiles: self read" on public.profiles;
create policy "profiles: self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles: self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "user_roles: self read" on public.user_roles;
create policy "user_roles: self read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "hotels: read" on public.hotels;
create policy "hotels: read" on public.hotels for select to authenticated using (true);
drop policy if exists "hotels: write" on public.hotels;
create policy "hotels: write" on public.hotels for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "hotels: update" on public.hotels;
create policy "hotels: update" on public.hotels for update to authenticated using (auth.uid() is not null);
drop policy if exists "hotels: admin delete" on public.hotels;
create policy "hotels: admin delete" on public.hotels for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "tours_catalog: read" on public.tours_catalog;
create policy "tours_catalog: read" on public.tours_catalog for select to authenticated using (true);
drop policy if exists "tours_catalog: admin write" on public.tours_catalog;
create policy "tours_catalog: admin write" on public.tours_catalog for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists "tours_catalog: admin update" on public.tours_catalog;
create policy "tours_catalog: admin update" on public.tours_catalog for update to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "tours_catalog: admin delete" on public.tours_catalog;
create policy "tours_catalog: admin delete" on public.tours_catalog for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "customers: read" on public.customers;
create policy "customers: read" on public.customers for select to authenticated using (true);
drop policy if exists "customers: insert" on public.customers;
create policy "customers: insert" on public.customers for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "customers: update" on public.customers;
create policy "customers: update" on public.customers for update to authenticated
  using (public.is_admin(auth.uid()) or created_by = auth.uid());
drop policy if exists "customers: admin delete" on public.customers;
create policy "customers: admin delete" on public.customers for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "reservations: select" on public.reservations;
create policy "reservations: select" on public.reservations for select to authenticated
  using (public.is_admin(auth.uid()) or seller_id = auth.uid());
drop policy if exists "reservations: insert" on public.reservations;
create policy "reservations: insert" on public.reservations for insert to authenticated
  with check (seller_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "reservations: update" on public.reservations;
create policy "reservations: update" on public.reservations for update to authenticated
  using (public.is_admin(auth.uid()) or seller_id = auth.uid());
drop policy if exists "reservations: admin delete" on public.reservations;
create policy "reservations: admin delete" on public.reservations for delete to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "reservation_tours: select" on public.reservation_tours;
create policy "reservation_tours: select" on public.reservation_tours for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "reservation_tours: insert" on public.reservation_tours;
create policy "reservation_tours: insert" on public.reservation_tours for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "reservation_tours: update" on public.reservation_tours;
create policy "reservation_tours: update" on public.reservation_tours for update to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "reservation_tours: delete" on public.reservation_tours;
create policy "reservation_tours: delete" on public.reservation_tours for delete to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));

drop policy if exists "payments: select" on public.payments;
create policy "payments: select" on public.payments for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "payments: insert" on public.payments;
create policy "payments: insert" on public.payments for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "payments: update" on public.payments;
create policy "payments: update" on public.payments for update to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "payments: admin delete" on public.payments;
create policy "payments: admin delete" on public.payments for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "documents: select" on public.documents;
create policy "documents: select" on public.documents for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "documents: insert" on public.documents;
create policy "documents: insert" on public.documents for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "documents: admin delete" on public.documents;
create policy "documents: admin delete" on public.documents for delete to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "contracts: select" on public.contracts;
create policy "contracts: select" on public.contracts for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "contracts: insert" on public.contracts;
create policy "contracts: insert" on public.contracts for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));

drop policy if exists "email_logs: select" on public.email_logs;
create policy "email_logs: select" on public.email_logs for select to authenticated
  using (reservation_id is null or exists (select 1 from public.reservations r where r.id = reservation_id and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())));
drop policy if exists "email_logs: insert" on public.email_logs;
create policy "email_logs: insert" on public.email_logs for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "audit_logs: admin read" on public.audit_logs;
create policy "audit_logs: admin read" on public.audit_logs for select to authenticated using (public.is_admin(auth.uid()));

-- Storage buckets ----------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('contracts','contracts',false),('invoices','invoices',false),
  ('receipts','receipts',false),('misc','misc',false),('branding','branding',true)
on conflict (id) do nothing;

drop policy if exists "auth read buckets" on storage.objects;
create policy "auth read buckets" on storage.objects for select to authenticated
  using (bucket_id in ('contracts','invoices','receipts','misc','branding'));
drop policy if exists "auth write buckets" on storage.objects;
create policy "auth write buckets" on storage.objects for insert to authenticated
  with check (bucket_id in ('contracts','invoices','receipts','misc'));
drop policy if exists "auth update buckets" on storage.objects;
create policy "auth update buckets" on storage.objects for update to authenticated
  using (bucket_id in ('contracts','invoices','receipts','misc'));
drop policy if exists "admin delete buckets" on storage.objects;
create policy "admin delete buckets" on storage.objects for delete to authenticated
  using (bucket_id in ('contracts','invoices','receipts','misc') and public.is_admin(auth.uid()));
drop policy if exists "public read branding" on storage.objects;
create policy "public read branding" on storage.objects for select to anon using (bucket_id = 'branding');

-- Dashboard RPC ------------------------------------------------------------
create or replace function public.dashboard_metrics(_from date, _to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reservations_count', (select count(*) from public.reservations r where r.reservation_date between _from and _to and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())),
    'pax_total', (select coalesce(sum(c.pax_count),0) from public.reservations r join public.customers c on c.id = r.customer_id where r.reservation_date between _from and _to and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())),
    'sold_amount', (select coalesce(sum(total_amount),0) from public.reservations r where r.reservation_date between _from and _to and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())),
    'received_amount', (select coalesce(sum(paid_amount),0) from public.reservations r where r.reservation_date between _from and _to and (public.is_admin(auth.uid()) or r.seller_id = auth.uid())),
    'pending_balance', (select coalesce(sum(balance),0) from public.reservations r where r.reservation_date between _from and _to and (public.is_admin(auth.uid()) or r.seller_id = auth.uid()))
  );
$$;
