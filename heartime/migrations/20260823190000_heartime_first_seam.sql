-- PowerFarm Heartime: permanent First Seam scheduling contracts.
--
-- This migration does not create a bus. It gives Heartime durable declarations
-- of what must be reconciled, by which reconciler, for which institutional
-- scope, and by when. Physical wake machinery may evaporate; these contracts do
-- not.

create schema if not exists heartime;

-- Heartime persists summaries, never the Card, WakePack, prompt, response body,
-- or workflow state owned by another organ. The recursive guard arms that
-- boundary in PostgreSQL instead of relying only on caller discipline.
create or replace function heartime.reconciliation_summary_is_compact(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
strict
as $$
declare
  v_key   text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      if lower(v_key) = any(array[
        'card', 'cards', 'card_body', 'payload', 'prompt', 'wake_pack',
        'response', 'responses', 'workflow_state'
      ]) then
        return false;
      end if;
      if jsonb_typeof(v_child) in ('object', 'array')
         and not heartime.reconciliation_summary_is_compact(v_child) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if jsonb_typeof(v_child) in ('object', 'array')
         and not heartime.reconciliation_summary_is_compact(v_child) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;

create table heartime.reconciliation_contracts (
  id                  text primary key check (id ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  organ_id            text not null references heartime.organs(id) on delete restrict,
  reconciler_ref      text not null check (reconciler_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  resource_hint       text not null check (resource_hint ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),

  -- Maximum intended silence for this reconciliation contract. This is a
  -- freshness promise, not a fixed polling interval.
  freshness_minutes   integer not null check (freshness_minutes between 1 and 43200),

  status              text not null default 'active'
                      check (status in ('active', 'paused', 'retired')),
  generation          bigint not null default 1 check (generation > 0),
  failure_count       integer not null default 0 check (failure_count >= 0),

  last_started_at     timestamptz,
  last_completed_at   timestamptz,
  next_expected       timestamptz not null default now(),
  last_summary        jsonb check (
                        last_summary is null or (
                          octet_length(last_summary::text) <= 65536
                          and heartime.reconciliation_summary_is_compact(last_summary)
                        )
                      ),

  registered_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid not null references public.identities(id)
);

create index reconciliation_contracts_due
  on heartime.reconciliation_contracts (reconciler_ref, next_expected, id)
  where status = 'active';

create table heartime.reconciliation_observations (
  id                  bigint generated always as identity primary key,
  contract_id         text not null references heartime.reconciliation_contracts(id) on delete restrict,
  beat_id             bigint not null references heartime.beats(id) on delete restrict,
  contract_generation bigint not null check (contract_generation > 0),
  state               text not null check (state in ('reconciled', 'blocked', 'failed', 'unknown', 'superseded')),
  summary             jsonb not null check (
                        octet_length(summary::text) <= 65536
                        and heartime.reconciliation_summary_is_compact(summary)
                      ),
  observed_at         timestamptz not null default now(),
  created_by          uuid not null references public.identities(id)
);

create unique index reconciliation_observations_one_per_beat
  on heartime.reconciliation_observations (beat_id);

alter table heartime.beats
  add column contract_id text references heartime.reconciliation_contracts(id) on delete restrict,
  add column reconciler_ref text check (
    reconciler_ref is null or reconciler_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'
  ),
  add column resource_hint text check (
    resource_hint is null or resource_hint ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'
  ),
  add column contract_generation bigint check (
    contract_generation is null or contract_generation > 0
  );

alter table heartime.beats
  add constraint beats_contract_shape check (
    (contract_id is null and reconciler_ref is null and resource_hint is null and contract_generation is null)
    or
    (contract_id is not null and reconciler_ref is not null and resource_hint is not null and contract_generation is not null)
  );

create or replace function heartime.bump_reconciliation_contract_generation()
returns trigger
language plpgsql
security invoker
as $$
begin
  if row(
       new.organ_id, new.reconciler_ref, new.resource_hint,
       new.freshness_minutes, new.status
     ) is distinct from row(
       old.organ_id, old.reconciler_ref, old.resource_hint,
       old.freshness_minutes, old.status
     ) then
    new.generation := greatest(new.generation, old.generation + 1);
  elsif new.generation < old.generation then
    raise exception 'heartime: contract generation cannot move backwards';
  end if;
  return new;
end $$;

create trigger reconciliation_contracts_revision
  before update on heartime.reconciliation_contracts
  for each row execute function heartime.bump_reconciliation_contract_generation();

create trigger reconciliation_contracts_touch
  before update on heartime.reconciliation_contracts
  for each row execute function heartime.touch();

alter table heartime.reconciliation_contracts enable row level security;
alter table heartime.reconciliation_observations enable row level security;

create policy reconciliation_contracts_read
  on heartime.reconciliation_contracts for select to authenticated using (true);
create policy reconciliation_observations_read
  on heartime.reconciliation_observations for select to authenticated using (true);

create policy reconciliation_contracts_insert
  on heartime.reconciliation_contracts for insert to authenticated
  with check (public.eh_membro());
create policy reconciliation_contracts_update
  on heartime.reconciliation_contracts for update to authenticated
  using (public.eh_membro()) with check (public.eh_membro());
create policy reconciliation_observations_insert
  on heartime.reconciliation_observations for insert to authenticated
  with check (public.eh_membro());

-- This is deliberately narrower than the global heartime.next_wake(). The
-- current physical First Seam setting can invoke one reconciler contract. It
-- MUST NOT claim a deadline for an obligation it cannot service. Future seams
-- can reuse the same durable table with another ReconcilerRef or add an honest
-- dispatcher without changing this contract.
create or replace function heartime.next_reconciliation_wake_v1(
  p_now            timestamptz default now(),
  p_reconciler_ref text default 'pf.reconciler.attention'
)
returns timestamptz
language sql
stable
security invoker
as $$
  select case
           when min(deadline) is null then null
           else greatest(p_now, min(deadline))
         end
    from (
      select min(c.next_expected) as deadline
        from heartime.reconciliation_contracts c
       where c.status = 'active'
         and c.reconciler_ref = p_reconciler_ref
      union all
      -- A beat emitted without an observation remains due. This makes a crash
      -- after emission recoverable from current state rather than message replay.
      select case when count(*) > 0 then p_now else null end
        from heartime.beats b
        join heartime.reconciliation_contracts c on c.id = b.contract_id
        left join heartime.reconciliation_observations o on o.beat_id = b.id
       where b.reconciler_ref = p_reconciler_ref
         and b.contract_id is not null
         and c.status = 'active'
         and c.generation = b.contract_generation
         and o.id is null
    ) deadlines;
$$;

-- Atomically claims every currently-due contract for the reconciler supported
-- by this physical setting and writes the next deadline at emission. The
-- returned object contains only references and reasons; never Card, WakePack,
-- prompt, response, or business payload.
create or replace function heartime.prepare_cycle_v1(
  p_now            timestamptz default now(),
  p_limit          integer default 32,
  p_reconciler_ref text default 'pf.reconciler.attention'
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_me        uuid := public.identidade_atual();
  v_contract  heartime.reconciliation_contracts%rowtype;
  v_open      record;
  v_due       timestamptz;
  v_beat_id   bigint;
  v_beats     jsonb := '[]'::jsonb;
  v_remaining integer;
begin
  if v_me is null then raise exception 'heartime: sem identidade'; end if;
  if p_limit < 1 or p_limit > 256 then raise exception 'heartime: p_limit fora do intervalo'; end if;
  if p_reconciler_ref !~ '^pf(\.[a-z0-9][a-z0-9-]*)+$' then
    raise exception 'heartime: ReconcilerRef invalido: %', p_reconciler_ref;
  end if;

  -- A contract revision or retirement does not erase an emitted beat. It ends
  -- that beat explicitly as superseded so lineage remains inspectable without
  -- allowing stale work to keep the physical clock spinning forever.
  insert into heartime.reconciliation_observations (
    contract_id, beat_id, contract_generation, state, summary,
    observed_at, created_by
  )
  select b.contract_id, b.id, b.contract_generation, 'superseded',
         jsonb_build_object(
           'state', 'superseded',
           'reason', case when c.status <> 'active' then 'contract_not_active' else 'contract_generation_changed' end,
           'current_contract_generation', c.generation
         ),
         p_now, v_me
    from heartime.beats b
    join heartime.reconciliation_contracts c on c.id = b.contract_id
    left join heartime.reconciliation_observations o on o.beat_id = b.id
   where b.reconciler_ref = p_reconciler_ref
     and o.id is null
     and (c.status <> 'active' or c.generation <> b.contract_generation)
  on conflict (beat_id) do nothing;

  -- Open beats are durable current state. A Worker can die after emission and
  -- before finish_cycle; the next level-triggered pass must return the same
  -- BeatRef before creating another beat for that contract.
  for v_open in
    select b.id, b.reconciler_ref, b.reason, b.resource_hint,
           b.contract_id, b.contract_generation
      from heartime.beats b
      join heartime.reconciliation_contracts c on c.id = b.contract_id
      left join heartime.reconciliation_observations o on o.beat_id = b.id
     where b.reconciler_ref = p_reconciler_ref
       and b.contract_id is not null
       and c.status = 'active'
       and c.generation = b.contract_generation
       and o.id is null
     order by b.sent_at, b.id
     limit p_limit
  loop
    v_beats := v_beats || jsonb_build_array(jsonb_build_object(
      'ref', 'pf.beat.' || v_open.id::text,
      'reconciler_ref', v_open.reconciler_ref,
      'reason', coalesce(v_open.reason, 'reconciliation_open'),
      'resource_hint', v_open.resource_hint,
      'contract_ref', v_open.contract_id,
      'contract_generation', v_open.contract_generation
    ));
  end loop;

  v_remaining := p_limit - jsonb_array_length(v_beats);

  if v_remaining > 0 then
    for v_contract in
      select c.*
        from heartime.reconciliation_contracts c
       where c.status = 'active'
         and c.reconciler_ref = p_reconciler_ref
         and c.next_expected <= p_now
         and not exists (
           select 1
             from heartime.beats b
             left join heartime.reconciliation_observations o on o.beat_id = b.id
            where b.contract_id = c.id
              and b.contract_generation = c.generation
              and o.id is null
         )
       order by c.next_expected, c.id
       limit v_remaining
       for update of c skip locked
    loop
      v_due := p_now + make_interval(mins => v_contract.freshness_minutes);

      insert into heartime.beats (
        organ_id, branch, probe, reason, sent_at, due_at, author,
        extraordinary, created_by, contract_id, reconciler_ref,
        resource_hint, contract_generation
      ) values (
        v_contract.organ_id, 'parasympathetic', 'wake', 'reconciliation_due',
        p_now, v_due, v_me::text, false, v_me, v_contract.id,
        v_contract.reconciler_ref, v_contract.resource_hint,
        v_contract.generation
      ) returning id into v_beat_id;

      update heartime.reconciliation_contracts
         set last_started_at = p_now,
             next_expected = v_due
       where id = v_contract.id;

      v_beats := v_beats || jsonb_build_array(jsonb_build_object(
        'ref', 'pf.beat.' || v_beat_id::text,
        'reconciler_ref', v_contract.reconciler_ref,
        'reason', 'reconciliation_due',
        'resource_hint', v_contract.resource_hint,
        'contract_ref', v_contract.id,
        'contract_generation', v_contract.generation
      ));
    end loop;
  end if;

  return jsonb_build_object(
    'contract_version', 'powerfarm.heartime.cycle.v1',
    'beats', v_beats,
    'next_wake', heartime.next_reconciliation_wake_v1(p_now, p_reconciler_ref)
  );
end $$;

-- Records compact reconciliation summaries only. Duplicate completion of the
-- same beat is harmless. A result from an older contract generation remains
-- attributable but cannot advance a newer declaration.
create or replace function heartime.finish_cycle_v1(
  p_now            timestamptz,
  p_beat_refs      text[],
  p_summaries      jsonb,
  p_reconciler_ref text default 'pf.reconciler.attention'
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_me          uuid := public.identidade_atual();
  v_i           integer;
  v_beat_id     bigint;
  v_contract_id text;
  v_generation  bigint;
  v_summary     jsonb;
  v_state       text;
  v_freshness   integer;
  v_inserted    integer;
begin
  if v_me is null then raise exception 'heartime: sem identidade'; end if;
  if jsonb_typeof(p_summaries) is distinct from 'array' then raise exception 'heartime: summaries deve ser array'; end if;
  if coalesce(array_length(p_beat_refs, 1), 0) <> jsonb_array_length(p_summaries) then
    raise exception 'heartime: beat_refs e summaries com tamanhos diferentes';
  end if;

  for v_i in 1..coalesce(array_length(p_beat_refs, 1), 0) loop
    if p_beat_refs[v_i] !~ '^pf\.beat\.[0-9]+$' then
      raise exception 'heartime: BeatRef invalido: %', p_beat_refs[v_i];
    end if;
    v_beat_id := substring(p_beat_refs[v_i] from '^pf\.beat\.([0-9]+)$')::bigint;
    v_summary := p_summaries -> (v_i - 1);

    if jsonb_typeof(v_summary) <> 'object' then
      raise exception 'heartime: summary deve ser objeto';
    end if;
    if octet_length(v_summary::text) > 65536
       or not heartime.reconciliation_summary_is_compact(v_summary) then
      raise exception 'heartime: summary viola o contrato compacto';
    end if;

    v_state := coalesce(v_summary ->> 'state', 'unknown');
    if v_state not in ('reconciled', 'blocked', 'failed', 'unknown') then
      raise exception 'heartime: estado de reconciliacao invalido: %', v_state;
    end if;

    select b.contract_id, b.contract_generation, c.freshness_minutes
      into v_contract_id, v_generation, v_freshness
      from heartime.beats b
      join heartime.reconciliation_contracts c on c.id = b.contract_id
     where b.id = v_beat_id
       and b.reconciler_ref = p_reconciler_ref;

    if v_contract_id is null then
      raise exception 'heartime: beat sem contrato compativel: %', p_beat_refs[v_i];
    end if;

    insert into heartime.reconciliation_observations (
      contract_id, beat_id, contract_generation, state, summary,
      observed_at, created_by
    ) values (
      v_contract_id, v_beat_id, v_generation, v_state, v_summary,
      p_now, v_me
    ) on conflict (beat_id) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      update heartime.reconciliation_contracts
         set last_completed_at = p_now,
             last_summary = v_summary,
             failure_count = 0,
             next_expected = p_now + make_interval(
               mins => case when v_state = 'reconciled' then v_freshness else 1 end
             )
       where id = v_contract_id
         and generation = v_generation;
    end if;
  end loop;

  return jsonb_build_object(
    'contract_version', 'powerfarm.heartime.cycle.v1',
    'next_wake', heartime.next_reconciliation_wake_v1(p_now, p_reconciler_ref)
  );
end $$;

-- A downstream outage must not exhaust provider retries and silence Heartime.
-- Failure is persisted against emitted beats, each affected contract is brought
-- forward, and the physical engine receives a new deadline.
create or replace function heartime.defer_failure_v1(
  p_now            timestamptz,
  p_beat_refs      text[],
  p_retry_count    integer,
  p_error          text,
  p_reconciler_ref text default 'pf.reconciler.attention'
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_me          uuid := public.identidade_atual();
  v_ref         text;
  v_beat_id     bigint;
  v_contract_id text;
  v_generation  bigint;
  v_failure_count integer;
  v_delay       integer;
  v_summary     jsonb;
begin
  if v_me is null then raise exception 'heartime: sem identidade'; end if;
  if p_retry_count < 0 then raise exception 'heartime: retry_count invalido'; end if;

  foreach v_ref in array coalesce(p_beat_refs, array[]::text[]) loop
    if v_ref !~ '^pf\.beat\.[0-9]+$' then
      raise exception 'heartime: BeatRef invalido: %', v_ref;
    end if;
    v_beat_id := substring(v_ref from '^pf\.beat\.([0-9]+)$')::bigint;

    select b.contract_id, b.contract_generation, c.failure_count
      into v_contract_id, v_generation, v_failure_count
      from heartime.beats b
      join heartime.reconciliation_contracts c on c.id = b.contract_id
     where b.id = v_beat_id
       and b.reconciler_ref = p_reconciler_ref;

    if v_contract_id is not null then
      v_failure_count := greatest(coalesce(v_failure_count, 0) + 1, p_retry_count + 1);
      v_delay := least(300, (5 * power(2, greatest(0, least(v_failure_count - 1, 8))))::integer);
      v_summary := jsonb_build_object(
        'state', 'failed',
        'error', left(coalesce(p_error, 'unknown failure'), 2000),
        'failure_count', v_failure_count
      );
      insert into heartime.reconciliation_observations (
        contract_id, beat_id, contract_generation, state, summary,
        observed_at, created_by
      ) values (
        v_contract_id, v_beat_id, v_generation, 'failed', v_summary,
        p_now, v_me
      ) on conflict (beat_id) do nothing;

      update heartime.reconciliation_contracts
         set next_expected = least(next_expected, p_now + make_interval(secs => v_delay)),
             last_summary = v_summary,
             failure_count = v_failure_count
       where id = v_contract_id
         and generation = v_generation;
    end if;
  end loop;

  return jsonb_build_object(
    'contract_version', 'powerfarm.heartime.cycle.v1',
    'next_wake', heartime.next_reconciliation_wake_v1(p_now, p_reconciler_ref)
  );
end $$;

-- Supabase/PostgREST custom schemas require both API exposure and explicit
-- PostgreSQL privileges. RLS remains the semantic gate; these grants merely
-- make the versioned functions and tables reachable to authenticated runtime
-- identities. The `heartime` schema must also be added to exposed schemas in
-- the Supabase API configuration before deployment.
revoke all on heartime.reconciliation_contracts, heartime.reconciliation_observations from public, anon;
grant select, insert, update on heartime.reconciliation_contracts to authenticated;
grant select, insert on heartime.reconciliation_observations to authenticated;
grant usage, select on all sequences in schema heartime to authenticated;

revoke all on function heartime.reconciliation_summary_is_compact(jsonb) from public, anon;
revoke all on function heartime.bump_reconciliation_contract_generation() from public, anon;
revoke all on function heartime.next_reconciliation_wake_v1(timestamptz, text) from public, anon;
revoke all on function heartime.prepare_cycle_v1(timestamptz, integer, text) from public, anon;
revoke all on function heartime.finish_cycle_v1(timestamptz, text[], jsonb, text) from public, anon;
revoke all on function heartime.defer_failure_v1(timestamptz, text[], integer, text, text) from public, anon;

grant execute on function heartime.reconciliation_summary_is_compact(jsonb) to authenticated;
grant execute on function heartime.bump_reconciliation_contract_generation() to authenticated;
grant execute on function heartime.next_reconciliation_wake_v1(timestamptz, text) to authenticated;
grant execute on function heartime.prepare_cycle_v1(timestamptz, integer, text) to authenticated;
grant execute on function heartime.finish_cycle_v1(timestamptz, text[], jsonb, text) to authenticated;
grant execute on function heartime.defer_failure_v1(timestamptz, text[], integer, text, text) to authenticated;
