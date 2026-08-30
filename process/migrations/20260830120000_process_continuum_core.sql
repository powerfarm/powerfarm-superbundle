-- PowerFarm Process -- Continuum institutional consequence schema.
-- Registry identity is referenced by stable UUID, never owned or mutated here.
-- Admission writes are reserved for a dedicated Process role; authenticated is read-only.

create schema if not exists continuum;
revoke all on schema continuum from public, anon, authenticated;
grant usage on schema continuum to authenticated;

create table continuum.institutions (
  id text primary key check (id ~ '^inst_[0-9a-f]{32}$'),
  title text,
  canonical_timeline text not null default 'main',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table continuum.timelines (
  institution_id text not null references continuum.institutions(id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9._:-]{1,128}$'),
  parent_id text,
  fork_act_id uuid,
  label text,
  canonical boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (institution_id, id),
  foreign key (institution_id, parent_id)
    references continuum.timelines(institution_id, id)
    deferrable initially deferred,
  check (parent_id is null or parent_id <> id)
);

create unique index continuum_one_canonical_timeline
  on continuum.timelines(institution_id) where canonical;

create table continuum.acts (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  institution_id text not null,
  timeline_id text not null,
  timeline_index bigint not null check (timeline_index > 0),
  request_id text,
  recorded_at timestamptz not null default now(),
  effective_at timestamptz not null,
  actor_ref uuid not null,
  office_ref uuid not null,
  occupancy_ref uuid,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  subject text not null check (length(subject) between 1 and 1024),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  authority_ref text not null,
  direction_ref text,
  effective_capability_set_sha256 text
    check (effective_capability_set_sha256 is null or effective_capability_set_sha256 ~ '^[0-9a-f]{64}$'),
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  prev_sha256 text not null check (prev_sha256 ~ '^[0-9a-f]{64}$'),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  local_seal text check (local_seal is null or local_seal ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  foreign key (institution_id, timeline_id)
    references continuum.timelines(institution_id, id),
  unique (institution_id, timeline_id, timeline_index),
  unique (institution_id, timeline_id, request_id),
  unique (institution_id, timeline_id, prev_sha256)
);

create index continuum_acts_subject on continuum.acts(institution_id, subject, effective_at);
create index continuum_acts_kind on continuum.acts(institution_id, kind, recorded_at);
create index continuum_acts_timeline on continuum.acts(institution_id, timeline_id, timeline_index);
create index continuum_acts_office on continuum.acts(office_ref, recorded_at);

create table continuum.act_causes (
  act_id uuid not null references continuum.acts(id) on delete cascade,
  cause_act_id uuid not null references continuum.acts(id),
  relation text not null default 'caused_by'
    check (relation in ('caused_by','evidenced_by','authorized_by','supersedes','depends_on')),
  ordinal integer not null default 0 check (ordinal >= 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (act_id, cause_act_id, relation),
  check (act_id <> cause_act_id)
);

create index continuum_causes_reverse on continuum.act_causes(cause_act_id, act_id);

create table continuum.act_signatures (
  act_id uuid not null references continuum.acts(id) on delete cascade,
  signer_identity_ref uuid not null,
  registry_key_ref uuid not null,
  algorithm text not null check (algorithm = 'ES256'),
  signature text not null,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (act_id, registry_key_ref)
);

create table continuum.checkpoints (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references continuum.institutions(id) on delete cascade,
  checkpoint_sha256 text not null unique check (checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table continuum.witness_keys (
  key_id text primary key check (key_id ~ '^[0-9a-f]{64}$'),
  witness text not null,
  jwk jsonb not null check (jsonb_typeof(jwk) = 'object'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table continuum.witness_receipts (
  checkpoint_id uuid not null references continuum.checkpoints(id) on delete cascade,
  key_id text not null references continuum.witness_keys(key_id),
  statement_sha256 text not null check (statement_sha256 ~ '^[0-9a-f]{64}$'),
  signature text not null,
  signed_at timestamptz not null,
  received_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (checkpoint_id, key_id)
);

create table continuum.external_receipts (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references continuum.institutions(id) on delete cascade,
  source text not null,
  subject text not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (institution_id, source, receipt_sha256)
);

alter table continuum.institutions enable row level security;
alter table continuum.timelines enable row level security;
alter table continuum.acts enable row level security;
alter table continuum.act_causes enable row level security;
alter table continuum.act_signatures enable row level security;
alter table continuum.checkpoints enable row level security;
alter table continuum.witness_keys enable row level security;
alter table continuum.witness_receipts enable row level security;
alter table continuum.external_receipts enable row level security;

revoke all on all tables in schema continuum from anon, authenticated;
grant select on all tables in schema continuum to authenticated;
grant usage, select on all sequences in schema continuum to authenticated;

-- Temporary company-wide authenticated read projection. Admission writes are
-- deliberately absent until the dedicated Process admission role is deployed.
do $$
declare t text;
begin
  foreach t in array array[
    'institutions','timelines','acts','act_causes','act_signatures',
    'checkpoints','witness_keys','witness_receipts','external_receipts'
  ] loop
    execute format('create policy authenticated_read on continuum.%I for select to authenticated using (true)', t);
  end loop;
end $$;

create or replace view continuum.timeline_heads
with (security_invoker = true)
as
select distinct on (institution_id, timeline_id)
  institution_id, timeline_id, id as head_act_id, timeline_index,
  sha256 as head_sha256, recorded_at
from continuum.acts
order by institution_id, timeline_id, timeline_index desc;

grant select on continuum.timeline_heads to authenticated;

comment on column continuum.acts.actor_ref is 'Stable Registry IdentityRef; Process does not own the identity.';
comment on column continuum.acts.office_ref is 'Stable Registry OfficeRef; Process does not own the Office.';
comment on column continuum.acts.occupancy_ref is 'Exact Registry OccupancyRef observed for this act when available.';
comment on column continuum.acts.direction_ref is 'Versioned Direction reference authorizing the institutional context when required.';
comment on column continuum.acts.effective_capability_set_sha256 is 'Content digest of the effective capability set used at admission.';
