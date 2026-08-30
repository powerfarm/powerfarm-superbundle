-- PowerFarm Process -- production transactional admission writer.
--
-- Continuum decides institutional admissibility. This migration provides the
-- dedicated PostgreSQL persistence boundary for already-admitted acts. Direct
-- table writes remain unavailable to ordinary authenticated callers.

-- Provider UUIDs are optional transport coordinates. Canonical PowerFarm refs
-- remain durable across Supabase/project replacement.
alter table continuum.acts alter column actor_ref drop not null;
alter table continuum.acts alter column office_ref drop not null;
alter table continuum.acts add column if not exists actor_external_ref text;
alter table continuum.acts add column if not exists office_external_ref text;
alter table continuum.acts add column if not exists occupancy_external_ref text;

alter table continuum.acts drop constraint if exists continuum_acts_actor_identity_present;
alter table continuum.acts add constraint continuum_acts_actor_identity_present
  check (actor_ref is not null or actor_external_ref is not null);
alter table continuum.acts drop constraint if exists continuum_acts_office_identity_present;
alter table continuum.acts add constraint continuum_acts_office_identity_present
  check (office_ref is not null or office_external_ref is not null);

alter table continuum.act_signatures alter column registry_key_ref drop not null;
alter table continuum.act_signatures add column if not exists registry_key_fingerprint text
  check (registry_key_fingerprint is null or registry_key_fingerprint ~ '^[0-9a-f]{64}$');
alter table continuum.act_signatures drop constraint if exists continuum_signature_registry_key_present;
alter table continuum.act_signatures add constraint continuum_signature_registry_key_present
  check (registry_key_ref is not null or registry_key_fingerprint is not null);

create table continuum.admission_batches (
  request_id text primary key,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  institution_id text not null references continuum.institutions(id) on delete cascade,
  timeline_id text not null,
  expected_prev_sha256 text not null check (expected_prev_sha256 ~ '^[0-9a-f]{64}$'),
  first_act_id uuid,
  last_act_id uuid,
  act_count integer not null check (act_count >= 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (institution_id, timeline_id)
    references continuum.timelines(institution_id, id)
);

alter table continuum.admission_batches enable row level security;
revoke all on continuum.admission_batches from public, anon, authenticated;
grant select on continuum.admission_batches to authenticated;
create policy authenticated_read on continuum.admission_batches
  for select to authenticated using (true);

create or replace function continuum.current_runtime_ref_v1()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'powerfarm_subject_ref', ''),
    ''
  );
$$;

create or replace function continuum.assert_process_writer_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_ref text;
begin
  v_uid := auth.uid();
  v_ref := continuum.current_runtime_ref_v1();
  if v_uid is null then raise exception 'process_writer_auth_required'; end if;
  if v_ref is distinct from 'pf.runtime.process-writer' then
    raise exception 'process_writer_identity_required';
  end if;
  return v_uid;
end;
$$;

-- Bootstrap is separate from admission so ordinary batches cannot silently
-- create a new institution/timeline as a side effect.
create or replace function continuum.bootstrap_institution_v1(
  p_institution_id text,
  p_title text,
  p_timeline_id text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_writer uuid;
begin
  v_writer := continuum.assert_process_writer_v1();
  if p_institution_id !~ '^inst_[0-9a-f]{32}$' then raise exception 'invalid_institution_id'; end if;
  if p_timeline_id !~ '^[a-zA-Z0-9._:-]{1,128}$' then raise exception 'invalid_timeline_id'; end if;

  insert into continuum.institutions(id, title, canonical_timeline, created_by)
  values (p_institution_id, p_title, p_timeline_id, v_writer)
  on conflict (id) do nothing;

  insert into continuum.timelines(institution_id, id, canonical, created_by)
  values (p_institution_id, p_timeline_id, true, v_writer)
  on conflict (institution_id, id) do nothing;

  return jsonb_build_object(
    'contract_version', 'powerfarm.process.admission-write.v1',
    'data', jsonb_build_object('institution_id', p_institution_id, 'timeline_id', p_timeline_id)
  );
end;
$$;

create or replace function continuum.admit_batch_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer uuid;
  v_data jsonb;
  v_request_id text;
  v_request_sha text;
  v_institution text;
  v_timeline text;
  v_expected text;
  v_acts jsonb;
  v_existing continuum.admission_batches%rowtype;
  v_head_index bigint := 0;
  v_head_sha text := repeat('0', 64);
  v_prev text;
  v_index bigint;
  v_act jsonb;
  v_act_id uuid;
  v_first uuid;
  v_last uuid;
  v_count integer := 0;
  v_cause text;
  v_ordinal integer;
begin
  v_writer := continuum.assert_process_writer_v1();
  if jsonb_typeof(p_request) <> 'object' then raise exception 'admission_request_object_required'; end if;
  if p_request->>'contract_version' <> 'powerfarm.process.admission-write.v1' then
    raise exception 'admission_contract_mismatch';
  end if;
  v_data := p_request->'data';
  if jsonb_typeof(v_data) <> 'object' then raise exception 'admission_data_object_required'; end if;

  v_request_id := v_data->>'request_id';
  v_request_sha := lower(v_data->>'request_sha256');
  v_institution := v_data->>'institution_id';
  v_timeline := coalesce(v_data->>'timeline_id', 'main');
  v_expected := lower(v_data->>'expected_prev_sha256');
  v_acts := v_data->'acts';

  if v_request_id is null or length(v_request_id) < 8 then raise exception 'admission_request_id_required'; end if;
  if v_request_sha !~ '^[0-9a-f]{64}$' then raise exception 'admission_request_sha256_required'; end if;
  if v_institution !~ '^inst_[0-9a-f]{32}$' then raise exception 'invalid_institution_id'; end if;
  if v_timeline !~ '^[a-zA-Z0-9._:-]{1,128}$' then raise exception 'invalid_timeline_id'; end if;
  if v_expected !~ '^[0-9a-f]{64}$' then raise exception 'expected_prev_sha256_required'; end if;
  if jsonb_typeof(v_acts) <> 'array' or jsonb_array_length(v_acts) = 0 then
    raise exception 'admission_acts_required';
  end if;

  -- Exactly one writer may advance a timeline head at a time. This is a
  -- transaction-scoped coordination lock, not institutional Authority.
  perform pg_advisory_xact_lock(hashtextextended(v_institution || E'\x1f' || v_timeline, 0));

  select * into v_existing from continuum.admission_batches where request_id = v_request_id;
  if found then
    if v_existing.request_sha256 <> v_request_sha then raise exception 'admission_request_id_conflict'; end if;
    return jsonb_build_object(
      'contract_version', 'powerfarm.process.admission-write.v1',
      'data', jsonb_build_object(
        'request_id', v_existing.request_id,
        'institution_id', v_existing.institution_id,
        'timeline_id', v_existing.timeline_id,
        'first_act_id', v_existing.first_act_id,
        'last_act_id', v_existing.last_act_id,
        'act_count', v_existing.act_count,
        'replayed', true
      )
    );
  end if;

  perform 1 from continuum.timelines where institution_id = v_institution and id = v_timeline;
  if not found then raise exception 'admission_timeline_not_bootstrapped'; end if;

  select timeline_index, sha256 into v_head_index, v_head_sha
    from continuum.acts
   where institution_id = v_institution and timeline_id = v_timeline
   order by timeline_index desc limit 1;
  if not found then
    v_head_index := 0;
    v_head_sha := repeat('0', 64);
  end if;
  if v_head_sha <> v_expected then raise exception 'admission_stale_head'; end if;

  v_prev := v_head_sha;
  v_index := v_head_index;
  for v_act in select value from jsonb_array_elements(v_acts)
  loop
    v_count := v_count + 1;
    v_index := v_index + 1;
    if lower(v_act->>'prev_sha256') <> v_prev then raise exception 'admission_chain_break'; end if;
    if (v_act->>'timeline_index')::bigint <> v_index then raise exception 'admission_timeline_index_mismatch'; end if;
    if lower(v_act->>'sha256') !~ '^[0-9a-f]{64}$' then raise exception 'admission_act_sha256_required'; end if;
    if lower(v_act->>'intent_sha256') !~ '^[0-9a-f]{64}$' then raise exception 'admission_intent_sha256_required'; end if;
    v_act_id := (v_act->>'id')::uuid;
    if v_first is null then v_first := v_act_id; end if;
    v_last := v_act_id;

    insert into continuum.acts(
      id, institution_id, timeline_id, timeline_index, request_id,
      recorded_at, effective_at, actor_ref, office_ref, occupancy_ref,
      actor_external_ref, office_external_ref, occupancy_external_ref,
      kind, subject, payload, authority_ref, direction_ref,
      effective_capability_set_sha256, intent_sha256, prev_sha256, sha256,
      local_seal, created_by
    ) values (
      v_act_id, v_institution, v_timeline, v_index, nullif(v_act->>'request_id',''),
      (v_act->>'recorded_at')::timestamptz, (v_act->>'effective_at')::timestamptz,
      nullif(v_act->>'actor_identity_id','')::uuid,
      nullif(v_act->>'office_identity_id','')::uuid,
      nullif(v_act->>'occupancy_id','')::uuid,
      nullif(v_act->>'actor_ref',''), nullif(v_act->>'office_ref',''), nullif(v_act->>'occupancy_ref',''),
      v_act->>'kind', v_act->>'subject', coalesce(v_act->'payload','{}'::jsonb),
      v_act->>'authority_ref', nullif(v_act->>'direction_ref',''),
      nullif(lower(v_act->>'effective_capability_set_sha256'),''),
      lower(v_act->>'intent_sha256'), lower(v_act->>'prev_sha256'), lower(v_act->>'sha256'),
      nullif(v_act->>'local_seal',''), v_writer
    );

    v_ordinal := 0;
    for v_cause in select value from jsonb_array_elements_text(coalesce(v_act->'causes', '[]'::jsonb))
    loop
      insert into continuum.act_causes(act_id, cause_act_id, relation, ordinal, created_by)
      values (v_act_id, v_cause::uuid, 'caused_by', v_ordinal, v_writer);
      v_ordinal := v_ordinal + 1;
    end loop;

    v_prev := lower(v_act->>'sha256');
  end loop;

  insert into continuum.admission_batches(
    request_id, request_sha256, institution_id, timeline_id,
    expected_prev_sha256, first_act_id, last_act_id, act_count, created_by
  ) values (
    v_request_id, v_request_sha, v_institution, v_timeline,
    v_expected, v_first, v_last, v_count, v_writer
  );

  return jsonb_build_object(
    'contract_version', 'powerfarm.process.admission-write.v1',
    'data', jsonb_build_object(
      'request_id', v_request_id,
      'institution_id', v_institution,
      'timeline_id', v_timeline,
      'first_act_id', v_first,
      'last_act_id', v_last,
      'act_count', v_count,
      'head_sha256', v_prev,
      'replayed', false
    )
  );
end;
$$;

revoke all on function continuum.current_runtime_ref_v1() from public, anon;
revoke all on function continuum.assert_process_writer_v1() from public, anon;
revoke all on function continuum.bootstrap_institution_v1(text,text,text) from public, anon;
revoke all on function continuum.admit_batch_v1(jsonb) from public, anon;
grant execute on function continuum.bootstrap_institution_v1(text,text,text) to authenticated;
grant execute on function continuum.admit_batch_v1(jsonb) to authenticated;

comment on function continuum.admit_batch_v1(jsonb) is
  'Transactional persistence boundary for acts already admitted by Continuum. Requires pf.runtime.process-writer.';
