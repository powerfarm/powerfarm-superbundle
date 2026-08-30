-- PowerFarm Heartime -- writer identity hardening.
--
-- `authenticated` means the token is valid. It does NOT mean the caller is
-- Heartime. All durable circulation writes are restricted to the admitted
-- runtime identity `pf.runtime.heartime`.

create or replace function heartime.current_identity_is(p_identity_ref text)
returns boolean
language sql
stable
security invoker
set search_path = public, heartime, pg_temp
as $$
  select exists (
    select 1
      from public.identities i
     where i.id = public.identidade_atual()
       and i.name = p_identity_ref
  );
$$;

revoke all on function heartime.current_identity_is(text) from public, anon;
grant execute on function heartime.current_identity_is(text) to authenticated;

drop policy if exists organs_escrita on heartime.organs;
drop policy if exists organs_update on heartime.organs;
drop policy if exists beats_escrita on heartime.beats;
drop policy if exists echoes_escrita on heartime.echoes;
drop policy if exists signals_escrita on heartime.signals;

create policy organs_heartime_insert on heartime.organs
  for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy organs_heartime_update on heartime.organs
  for update to authenticated
  using (heartime.current_identity_is('pf.runtime.heartime'))
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy beats_heartime_insert on heartime.beats
  for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy echoes_heartime_insert on heartime.echoes
  for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy signals_heartime_insert on heartime.signals
  for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));

-- First Seam tables are also Heartime-owned durable circulation state.
drop policy if exists reconciliation_contracts_insert on heartime.reconciliation_contracts;
drop policy if exists reconciliation_contracts_update on heartime.reconciliation_contracts;
drop policy if exists reconciliation_observations_insert on heartime.reconciliation_observations;

create policy reconciliation_contracts_heartime_insert
  on heartime.reconciliation_contracts for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy reconciliation_contracts_heartime_update
  on heartime.reconciliation_contracts for update to authenticated
  using (heartime.current_identity_is('pf.runtime.heartime'))
  with check (heartime.current_identity_is('pf.runtime.heartime'));
create policy reconciliation_observations_heartime_insert
  on heartime.reconciliation_observations for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));
