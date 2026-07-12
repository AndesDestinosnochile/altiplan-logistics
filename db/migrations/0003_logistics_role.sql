-- =============================================================================
-- Andes Destinos — Papel "logistics" (PARTE 1 de 2)
-- Postgres exige que novos valores de enum sejam commitados ANTES de serem
-- usados em qualquer query/função. Por isso este arquivo faz APENAS o
-- ALTER TYPE. Rode este arquivo primeiro, depois rode 0003b_logistics_role.sql.
-- =============================================================================

alter type public.app_role add value if not exists 'logistics';

