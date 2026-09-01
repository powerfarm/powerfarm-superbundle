-- PowerFarm Heartime: which institution does this database serve?
--
--   Genesis creates an institution. Recovery must never create one.
--
-- Heartime carried no institutional identity at all. Its tables key on
-- ReconcilerRef, organ and component, none of which say *whose* circulation this
-- is. A Heartime worker pointed at the wrong database -- a restored snapshot, a
-- second project, a copied connection string -- had nothing to check and would
-- have beaten on someone else's institution without noticing.
--
-- A Heartime deployment serves exactly one institution, so identity is a
-- singleton rather than a column on every table. That is the smallest change
-- that makes the question answerable, and it keeps every existing RPC signature
-- intact.
--
-- The anchor is the same location-independent value the Continuum kernel derives
-- from its ledger. Nothing here names a host, a project or a connection.

create table if not exists heartime.institution (
  id                integer primary key check (id = 1),
  institution_ref   text not null check (institution_ref ~ '^inst_[0-9a-f]{32}$'),
  genesis_ref       text not null check (genesis_ref ~ '^evt_[0-9a-f]{32}$'),
  anchor_digest     text not null check (anchor_digest ~ '^[0-9a-f]{64}$'),
  protocol_version  text not null,
  created_by        uuid not null references public.identities(id),
  created_at        timestamptz not null default now()
);

alter table heartime.institution enable row level security;

create policy institution_read on heartime.institution
  for select to authenticated using (true);

-- Declaration ceremony. Binds this Heartime database to one institution, once.
-- Re-declaring the same institution is idempotent; re-declaring a different one
-- is the fork this table exists to prevent.
create or replace function heartime.declare_institution_v1(
  p_institution_ref text,
  p_genesis_ref text,
  p_anchor_digest text,
  p_protocol_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row heartime.institution%rowtype;
begin
  select * into v_row from heartime.institution where id = 1;
  if found then
    if v_row.institution_ref is distinct from p_institution_ref
       or v_row.genesis_ref is distinct from p_genesis_ref
       or v_row.anchor_digest is distinct from p_anchor_digest then
      raise exception 'heartime_institution_conflict: this database already serves %', v_row.institution_ref;
    end if;
  else
    insert into heartime.institution(id, institution_ref, genesis_ref, anchor_digest, protocol_version, created_by)
    values (1, p_institution_ref, p_genesis_ref, p_anchor_digest, p_protocol_version, public.identidade_atual());
  end if;

  return jsonb_build_object(
    'contract_version', 'powerfarm.heartime.institution-declare.v1',
    'data', jsonb_build_object('institution_ref', p_institution_ref, 'anchor_digest', p_anchor_digest)
  );
end;
$$;

-- Startup assertion. Read-only and fail-closed. Never creates.
create or replace function heartime.assert_institution_v1(
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
  v_row heartime.institution%rowtype;
begin
  if p_institution_ref !~ '^inst_[0-9a-f]{32}$' then
    raise exception 'invalid_institution_ref';
  end if;

  select * into v_row from heartime.institution where id = 1;
  if not found then
    -- An undeclared database is not authorization to start beating.
    raise exception 'heartime_institution_undeclared: this database serves no institution';
  end if;
  if v_row.institution_ref is distinct from p_institution_ref then
    raise exception 'heartime_institution_mismatch: this database serves %, not %',
      v_row.institution_ref, p_institution_ref;
  end if;
  if p_anchor_digest is not null and v_row.anchor_digest is distinct from p_anchor_digest then
    raise exception 'heartime_institution_anchor_mismatch: % is a different institution than the caller expects',
      p_institution_ref;
  end if;

  return jsonb_build_object(
    'contract_version', 'powerfarm.heartime.institution-assert.v1',
    'data', jsonb_build_object(
      'institution_ref', v_row.institution_ref,
      'genesis_ref', v_row.genesis_ref,
      'anchor_digest', v_row.anchor_digest,
      'protocol_version', v_row.protocol_version
    )
  );
end;
$$;

revoke all on function heartime.declare_institution_v1(text,text,text,text) from public, anon;
grant execute on function heartime.declare_institution_v1(text,text,text,text) to authenticated;
revoke all on function heartime.assert_institution_v1(text,text) from public, anon;
grant execute on function heartime.assert_institution_v1(text,text) to authenticated;

comment on table heartime.institution is
  'Which institution this Heartime database serves. Singleton: one deployment, one institution.';
comment on function heartime.assert_institution_v1(text,text) is
  'Startup assertion: fails closed unless this database serves the institution the worker declared. Never creates.';
