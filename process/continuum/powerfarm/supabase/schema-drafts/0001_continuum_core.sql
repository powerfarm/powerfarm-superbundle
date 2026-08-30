-- Powerfarm Continuum candidate schema.
-- REVIEW ONLY. This file is intentionally not applied by the local package.
-- The runtime is not the institution; these tables contain admitted institutional facts.

create schema if not exists continuum;
revoke all on schema continuum from public, anon, authenticated;
grant usage on schema continuum to authenticated;

create table if not exists continuum.institutions (
  id text primary key check (id ~ '^inst_[0-9a-f]{32}$'),
  title text,
  created_at timestamptz not null default now(),
  canonical_timeline text not null default 'main'
);

create table if not exists continuum.timelines (
  institution_id text not null references continuum.institutions(id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9._:-]{1,128}$'),
  parent_id text,
  fork_act_id uuid,
  created_at timestamptz not null default now(),
  label text,
  canonical boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  primary key (institution_id, id),
  foreign key (institution_id, parent_id)
    references continuum.timelines(institution_id, id)
    deferrable initially deferred,
  check (parent_id is null or parent_id <> id)
);

create unique index if not exists continuum_one_canonical_timeline
  on continuum.timelines(institution_id) where canonical;

create table if not exists continuum.acts (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  institution_id text not null,
  timeline_id text not null,
  timeline_index bigint not null check (timeline_index > 0),
  request_id text,
  recorded_at timestamptz not null default now(),
  effective_at timestamptz not null,
  actor_ref uuid references public.identities(id),
  office_ref uuid references public.identities(id),
  actor_external_ref text,
  office_external_ref text,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  subject text not null check (length(subject) between 1 and 1024),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  authority_ref text not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  prev_sha256 text not null check (prev_sha256 ~ '^[0-9a-f]{64}$'),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  local_seal text check (local_seal is null or local_seal ~ '^[0-9a-f]{64}$'),
  foreign key (institution_id, timeline_id)
    references continuum.timelines(institution_id, id),
  unique (institution_id, timeline_id, timeline_index),
  unique (institution_id, timeline_id, request_id),
  unique (institution_id, timeline_id, prev_sha256),
  check (actor_ref is not null or actor_external_ref is not null),
  check (office_ref is not null or office_external_ref is not null)
);

create index if not exists continuum_acts_subject on continuum.acts(institution_id, subject, effective_at);
create index if not exists continuum_acts_kind on continuum.acts(institution_id, kind, recorded_at);
create index if not exists continuum_acts_timeline on continuum.acts(institution_id, timeline_id, timeline_index);

create table if not exists continuum.act_causes (
  act_id uuid not null references continuum.acts(id) on delete cascade,
  cause_act_id uuid not null references continuum.acts(id),
  relation text not null default 'caused_by'
    check (relation in ('caused_by','evidenced_by','authorized_by','supersedes','depends_on')),
  ordinal integer not null default 0 check (ordinal >= 0),
  primary key (act_id, cause_act_id, relation),
  check (act_id <> cause_act_id)
);

create index if not exists continuum_causes_reverse on continuum.act_causes(cause_act_id, act_id);

comment on table continuum.acts is
  'Admitted institutional acts. Runtime events are referenced as evidence; they are not copied here by default.';
comment on table continuum.act_causes is
  'Queryable causal/support edges between admitted acts.';
