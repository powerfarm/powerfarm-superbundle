-- PowerFarm Process M7: institutional persistence is Card-bound.
-- The v1 writer remains an internal implementation detail. Authenticated
-- runtime callers must use admit_card_batch_v2 with exact circulation refs.

create table continuum.card_admission_bindings (
  request_id text primary key references continuum.admission_batches(request_id) on delete restrict,
  card_ref text not null check (card_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  beat_ref text not null check (beat_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  attempt_ref text not null check (attempt_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  execution_slice_sha256 text not null check (execution_slice_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  trace_ref text check (trace_ref is null or trace_ref ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

alter table continuum.card_admission_bindings enable row level security;
create policy card_admission_bindings_read on continuum.card_admission_bindings
  for select to authenticated using (true);

create or replace function continuum.admit_card_batch_v2(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer uuid;
  v_data jsonb;
  v_request_id text;
  v_card_ref text;
  v_beat_ref text;
  v_attempt_ref text;
  v_slice_sha text;
  v_trace_ref text;
  v_existing continuum.card_admission_bindings%rowtype;
  v_legacy jsonb;
  v_result jsonb;
begin
  v_writer := continuum.assert_process_writer_v1();
  if jsonb_typeof(p_request) <> 'object' then raise exception 'admission_request_object_required'; end if;
  if p_request->>'contract_version' <> 'powerfarm.process.admission-write.v2' then
    raise exception 'admission_contract_mismatch';
  end if;
  v_data := p_request->'data';
  if jsonb_typeof(v_data) <> 'object' then raise exception 'admission_data_object_required'; end if;

  v_request_id := v_data->>'request_id';
  v_card_ref := v_data->>'card_ref';
  v_beat_ref := v_data->>'beat_ref';
  v_attempt_ref := v_data->>'attempt_ref';
  v_slice_sha := lower(v_data->>'execution_slice_sha256');
  v_trace_ref := nullif(v_data->>'trace_ref', '');

  if v_card_ref !~ '^pf(\.[a-z0-9][a-z0-9-]*)+$' then raise exception 'card_ref_required'; end if;
  if v_beat_ref !~ '^pf(\.[a-z0-9][a-z0-9-]*)+$' then raise exception 'beat_ref_required'; end if;
  if v_attempt_ref !~ '^pf(\.[a-z0-9][a-z0-9-]*)+$' then raise exception 'attempt_ref_required'; end if;
  if v_slice_sha !~ '^sha256:[0-9a-f]{64}$' then raise exception 'execution_slice_sha256_required'; end if;
  if v_trace_ref is not null and v_trace_ref !~ '^pf(\.[a-z0-9][a-z0-9-]*)+$' then raise exception 'invalid_trace_ref'; end if;

  select * into v_existing from continuum.card_admission_bindings where request_id = v_request_id;
  if found then
    if v_existing.card_ref <> v_card_ref
       or v_existing.beat_ref <> v_beat_ref
       or v_existing.attempt_ref <> v_attempt_ref
       or v_existing.execution_slice_sha256 <> v_slice_sha
       or coalesce(v_existing.trace_ref, '') <> coalesce(v_trace_ref, '') then
      raise exception 'card_admission_binding_conflict';
    end if;
  end if;

  -- v1 remains the transaction implementation. Runtime access to v1 is
  -- revoked below, so every authenticated persistence call must pass v2.
  v_legacy := jsonb_build_object(
    'contract_version', 'powerfarm.process.admission-write.v1',
    'data', v_data - 'card_ref' - 'beat_ref' - 'attempt_ref' - 'execution_slice_sha256' - 'trace_ref'
  );
  v_result := continuum.admit_batch_v1(v_legacy);

  insert into continuum.card_admission_bindings(
    request_id, card_ref, beat_ref, attempt_ref, execution_slice_sha256, trace_ref, created_by
  ) values (
    v_request_id, v_card_ref, v_beat_ref, v_attempt_ref, v_slice_sha, v_trace_ref, v_writer
  ) on conflict (request_id) do nothing;

  return jsonb_build_object(
    'contract_version', 'powerfarm.process.admission-write.v2',
    'data', (v_result->'data') || jsonb_build_object(
      'card_ref', v_card_ref,
      'beat_ref', v_beat_ref,
      'attempt_ref', v_attempt_ref,
      'execution_slice_sha256', v_slice_sha,
      'trace_ref', v_trace_ref
    )
  );
end;
$$;

revoke all on function continuum.admit_batch_v1(jsonb) from authenticated;
revoke all on function continuum.admit_card_batch_v2(jsonb) from public, anon;
grant execute on function continuum.admit_card_batch_v2(jsonb) to authenticated;

comment on function continuum.admit_card_batch_v2(jsonb) is
  'M7 Card-only transactional persistence boundary. Requires pf.runtime.process-writer and exact Card/beat/attempt/ExecutionSlice refs.';
