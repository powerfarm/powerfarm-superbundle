-- PowerFarm Process: which institution does this database serve?
--
--   Genesis creates an institution. Recovery must never create one.
--
-- The Continuum kernel already refuses to open a store that is not the
-- institution a runtime declared. This migration gives the PostgreSQL side the
-- same property: a Process writer must state which institution it is serving,
-- and the database refuses if it is serving a different one -- or none.
--
-- Identity here is the same location-independent anchor the kernel derives from
-- the ledger. Nothing about the host, the connection string or the project is
-- part of it. The database may move; the institution may not.

alter table continuum.institutions
  add column if not exists genesis_ref text
    check (genesis_ref is null or genesis_ref ~ '^evt_[0-9a-f]{32}$'),
  add column if not exists anchor_digest text
    check (anchor_digest is null or anchor_digest ~ '^[0-9a-f]{64}$'),
  add column if not exists protocol_version text;

-- Startup assertion. Read-only and fail-closed: it answers "am I serving the
-- institution I was told to serve?" and raises otherwise. It never creates.
create or replace function continuum.assert_institution_v1(
  p_institution_ref text,
  p_anchor_digest text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row continuum.institutions%rowtype;
begin
  if p_institution_ref !~ '^inst_[0-9a-f]{32}$' then
    raise exception 'invalid_institution_ref';
  end if;

  select * into v_row from continuum.institutions where id = p_institution_ref;
  if not found then
    -- An empty or foreign database is not authorization to bootstrap.
    raise exception 'institution_not_present: this database does not serve %', p_institution_ref;
  end if;

  if p_anchor_digest is not null then
    if v_row.anchor_digest is null then
      raise exception 'institution_anchor_unrecorded: % has no recorded anchor to verify against', p_institution_ref;
    end if;
    if v_row.anchor_digest is distinct from p_anchor_digest then
      raise exception 'institution_anchor_mismatch: % is a different institution than the caller expects', p_institution_ref;
    end if;
  end if;

  return jsonb_build_object(
    'contract_version', 'powerfarm.process.institution-assert.v1',
    'data', jsonb_build_object(
      'institution_ref', v_row.id,
      'genesis_ref', v_row.genesis_ref,
      'anchor_digest', v_row.anchor_digest,
      'protocol_version', v_row.protocol_version,
      'canonical_timeline', v_row.canonical_timeline
    )
  );
end;
$$;

-- Genesis ceremony, carrying the anchor. Distinct from startup on purpose: this
-- is the only path that may bring an institution into existence here, and a
-- normal runtime never calls it.
create or replace function continuum.bootstrap_institution_v3(
  p_institution_id text,
  p_title text,
  p_genesis_ref text,
  p_anchor_digest text,
  p_protocol_version text,
  p_timeline_id text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer uuid;
  v_existing continuum.institutions%rowtype;
begin
  v_writer := continuum.assert_process_writer_v1();
  if p_institution_id !~ '^inst_[0-9a-f]{32}$' then raise exception 'invalid_institution_id'; end if;
  if p_timeline_id !~ '^[a-zA-Z0-9._:-]{1,128}$' then raise exception 'invalid_timeline_id'; end if;
  if p_genesis_ref !~ '^evt_[0-9a-f]{32}$' then raise exception 'invalid_genesis_ref'; end if;
  if p_anchor_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid_anchor_digest'; end if;

  select * into v_existing from continuum.institutions where id = p_institution_id;
  if found then
    -- Re-running the ceremony is permitted only when it is the same institution.
    -- Rewriting an anchor would be exactly the fork this migration exists to stop.
    if v_existing.anchor_digest is not null and v_existing.anchor_digest is distinct from p_anchor_digest then
      raise exception 'institution_anchor_conflict: % already serves a different anchor', p_institution_id;
    end if;
    if v_existing.genesis_ref is not null and v_existing.genesis_ref is distinct from p_genesis_ref then
      raise exception 'institution_genesis_conflict: % already serves a different genesis', p_institution_id;
    end if;
    update continuum.institutions
       set genesis_ref = coalesce(genesis_ref, p_genesis_ref),
           anchor_digest = coalesce(anchor_digest, p_anchor_digest),
           protocol_version = coalesce(protocol_version, p_protocol_version)
     where id = p_institution_id;
  else
    insert into continuum.institutions(id, title, canonical_timeline, created_by, genesis_ref, anchor_digest, protocol_version)
    values (p_institution_id, p_title, p_timeline_id, v_writer, p_genesis_ref, p_anchor_digest, p_protocol_version);
  end if;

  insert into continuum.timelines(institution_id, id, canonical, created_by)
  values (p_institution_id, p_timeline_id, true, v_writer)
  on conflict (institution_id, id) do nothing;

  return jsonb_build_object(
    'contract_version', 'powerfarm.process.bootstrap.v3',
    'data', jsonb_build_object(
      'institution_id', p_institution_id,
      'timeline_id', p_timeline_id,
      'genesis_ref', p_genesis_ref,
      'anchor_digest', p_anchor_digest
    )
  );
end;
$$;

revoke all on function continuum.assert_institution_v1(text,text) from public, anon;
grant execute on function continuum.assert_institution_v1(text,text) to authenticated;
revoke all on function continuum.bootstrap_institution_v3(text,text,text,text,text,text) from public, anon;
grant execute on function continuum.bootstrap_institution_v3(text,text,text,text,text,text) to authenticated;

comment on function continuum.assert_institution_v1(text,text) is
  'Startup assertion: fails closed unless this database serves the institution the caller declared. Never creates.';
comment on function continuum.bootstrap_institution_v3(text,text,text,text,text,text) is
  'Genesis ceremony carrying the institutional anchor. Genesis creates an institution; recovery never does.';
