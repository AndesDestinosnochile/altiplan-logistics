-- =============================================================================
-- Andes Destinos — Papel "logistics" (PARTE 2 de 2)
-- Rode SOMENTE depois de 0003_logistics_role.sql ter sido commitado.
-- =============================================================================

-- 1. Helper: pode ver todas as reservas? (admin OU logistics)
create or replace function public.can_view_all_reservations(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','logistics')
  );
$$;
grant execute on function public.can_view_all_reservations(uuid) to authenticated;

-- 2. Atualiza policies de leitura para permitir logistics
drop policy if exists "reservations: select" on public.reservations;
create policy "reservations: select" on public.reservations for select to authenticated
  using (public.can_view_all_reservations(auth.uid()) or seller_id = auth.uid());

drop policy if exists "reservation_tours: select" on public.reservation_tours;
create policy "reservation_tours: select" on public.reservation_tours for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())));

drop policy if exists "payments: select" on public.payments;
create policy "payments: select" on public.payments for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())));

drop policy if exists "documents: select" on public.documents;
create policy "documents: select" on public.documents for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())));

drop policy if exists "contracts: select" on public.contracts;
create policy "contracts: select" on public.contracts for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id
    and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())));

-- 3. Dashboard metrics respeitando logistics
create or replace function public.dashboard_metrics(_from date, _to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reservations_count', (select count(*) from public.reservations r
      where r.reservation_date between _from and _to
        and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())),
    'pax_total', (select coalesce(sum(c.pax_count),0) from public.reservations r
      join public.customers c on c.id = r.customer_id
      where r.reservation_date between _from and _to
        and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())),
    'sold_amount', (select coalesce(sum(total_amount),0) from public.reservations r
      where r.reservation_date between _from and _to
        and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())),
    'received_amount', (select coalesce(sum(paid_amount),0) from public.reservations r
      where r.reservation_date between _from and _to
        and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid())),
    'pending_balance', (select coalesce(sum(balance),0) from public.reservations r
      where r.reservation_date between _from and _to
        and (public.can_view_all_reservations(auth.uid()) or r.seller_id = auth.uid()))
  );
$$;

-- 4. Signup: trigger aceita metadata { role: 'seller' | 'logistics' }
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _requested text; _role public.app_role;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  _requested := lower(coalesce(new.raw_user_meta_data->>'role', 'seller'));
  -- Nunca aceitar 'admin' via signup — admin é promovido manualmente por SQL.
  if _requested = 'logistics' then _role := 'logistics';
  else _role := 'seller';
  end if;

  insert into public.user_roles (user_id, role) values (new.id, _role)
  on conflict (user_id, role) do nothing;
  return new;
end; $$;
