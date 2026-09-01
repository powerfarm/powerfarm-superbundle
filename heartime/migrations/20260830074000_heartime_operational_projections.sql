-- PowerFarm Heartime -- production operational tracing and pressure projection.
-- Trace/cost telemetry is not institutional Authority or Evidence. Heartime owns
-- only circulation observations and correlation.

-- Registry M6 adds institutional_ref. `to_jsonb` keeps this migration compatible
-- with older local fixtures while production prefers the canonical ref.
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
       and coalesce(to_jsonb(i)->>'institutional_ref', i.name) = p_identity_ref
  );
$$;

alter table heartime.beats add column if not exists trace_ref text;
update heartime.beats set trace_ref = 'pf.trace.beat.' || id::text where trace_ref is null;
alter table heartime.beats alter column trace_ref set not null;
alter table heartime.beats drop constraint if exists beats_trace_ref_format;
alter table heartime.beats add constraint beats_trace_ref_format
  check (trace_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$');
create unique index if not exists beats_trace_ref_unique on heartime.beats(trace_ref);

create or replace function heartime.trace_attributes_safe_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then return true; end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      if lower(v_key) = any(array[
        'prompt', 'chain_of_thought', 'card_body', 'authorization', 'secret',
        'password', 'credential', 'access_token', 'refresh_token', 'raw_input',
        'raw_output', 'workflow_state'
      ]) then
        return false;
      end if;
      if not heartime.trace_attributes_safe_v1(v_child) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if not heartime.trace_attributes_safe_v1(v_child) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create table heartime.trace_events (
  id bigint generated always as identity primary key,
  trace_ref text not null check (trace_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  component_ref text not null check (component_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  card_ref text check (card_ref is null or card_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  beat_ref text check (beat_ref is null or beat_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  attempt_ref text check (attempt_ref is null or attempt_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  attributes jsonb not null default '{}'::jsonb check (
    jsonb_typeof(attributes) = 'object'
    and octet_length(attributes::text) <= 16384
    and heartime.trace_attributes_safe_v1(attributes)
  ),
  observed_at timestamptz not null,
  created_by uuid not null references public.identities(id),
  created_at timestamptz not null default now()
);

create index trace_events_trace on heartime.trace_events(trace_ref, observed_at, id);
create index trace_events_card on heartime.trace_events(card_ref, observed_at) where card_ref is not null;
create index trace_events_beat on heartime.trace_events(beat_ref, observed_at) where beat_ref is not null;

alter table heartime.trace_events enable row level security;
create policy trace_events_read on heartime.trace_events for select to authenticated using (true);
create policy trace_events_heartime_insert on heartime.trace_events for insert to authenticated
  with check (heartime.current_identity_is('pf.runtime.heartime'));

grant select, insert on heartime.trace_events to authenticated;

grant usage, select on sequence heartime.trace_events_id_seq to authenticated;

create or replace function heartime.record_trace_event_v1(
  p_trace_ref text,
  p_component_ref text,
  p_event_name text,
  p_observed_at timestamptz,
  p_card_ref text default null,
  p_beat_ref text default null,
  p_attempt_ref text default null,
  p_attributes jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, heartime, pg_temp
as $$
declare v_id bigint; v_me uuid := public.identidade_atual();
begin
  if not heartime.current_identity_is('pf.runtime.heartime') then raise exception 'heartime_runtime_identity_required'; end if;
  if not heartime.trace_attributes_safe_v1(coalesce(p_attributes, '{}'::jsonb)) then
    raise exception 'trace_attributes_forbidden';
  end if;
  insert into heartime.trace_events(
    trace_ref, component_ref, event_name, card_ref, beat_ref, attempt_ref,
    attributes, observed_at, created_by
  ) values (
    p_trace_ref, p_component_ref, p_event_name, p_card_ref, p_beat_ref, p_attempt_ref,
    coalesce(p_attributes,'{}'::jsonb), p_observed_at, v_me
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function heartime.record_trace_event_v1(text,text,text,timestamptz,text,text,text,jsonb) from public, anon;
revoke all on function heartime.trace_attributes_safe_v1(jsonb) from public, anon;
grant execute on function heartime.trace_attributes_safe_v1(jsonb) to authenticated;
grant execute on function heartime.record_trace_event_v1(text,text,text,timestamptz,text,text,text,jsonb) to authenticated;

create or replace view heartime.circulation_pressure_v1
with (security_invoker = true)
as
select
  c.reconciler_ref,
  count(*) filter (where c.status = 'active')::bigint as active_contracts,
  count(*) filter (where c.status = 'active' and c.next_expected <= now())::bigint as overdue_contracts,
  coalesce(sum(c.failure_count) filter (where c.status = 'active'), 0)::bigint as failure_pressure,
  count(*) filter (
    where c.status = 'active' and exists (
      select 1 from heartime.beats b
      left join heartime.reconciliation_observations o on o.beat_id = b.id
      where b.contract_id = c.id and b.contract_generation = c.generation and o.id is null
    )
  )::bigint as open_beat_contracts,
  min(c.next_expected) filter (where c.status = 'active') as next_expected
from heartime.reconciliation_contracts c
group by c.reconciler_ref;

grant select on heartime.circulation_pressure_v1 to authenticated;
