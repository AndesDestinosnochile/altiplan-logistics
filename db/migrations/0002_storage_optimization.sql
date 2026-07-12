-- =============================================================================
-- Andes Destinos — Storage optimization
-- Adds content hashing to avoid duplicate uploads and to regenerate contracts
-- only when reservation data actually changes.
-- =============================================================================

-- Contracts: data_hash tracks the reservation payload signature so we can
-- skip regeneration when nothing changed. size_bytes lets us monitor storage.
alter table public.contracts
  add column if not exists data_hash text,
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text not null default 'application/pdf';

create unique index if not exists contracts_reservation_hash_uidx
  on public.contracts (reservation_id, data_hash);
create index if not exists contracts_data_hash_idx
  on public.contracts (data_hash);

-- Documents (invoices, receipts, misc): content_hash for cross-check dedup.
alter table public.documents
  add column if not exists content_hash text;

create index if not exists documents_content_hash_idx
  on public.documents (content_hash);
create unique index if not exists documents_res_kind_hash_uidx
  on public.documents (reservation_id, kind, content_hash)
  where content_hash is not null;

-- Helper: find any existing storage_path for a content hash (any reservation)
-- so an edge function can point a new document row at the same file instead
-- of uploading twice.
create or replace function public.find_document_by_hash(_hash text)
returns table (id uuid, storage_path text, mime_type text, size_bytes bigint)
language sql stable security definer set search_path = public as $$
  select id, storage_path, mime_type, size_bytes
  from public.documents
  where content_hash = _hash
  limit 1;
$$;
grant execute on function public.find_document_by_hash(text) to authenticated;
