-- Detached cryptographic attestations and external rollback/fork witnesses.
-- REVIEW ONLY.

create table if not exists continuum.act_signatures (
  act_id uuid not null references continuum.acts(id) on delete cascade,
  signer_identity uuid references public.identities(id),
  key_id uuid references public.identity_keys(id),
  algorithm text not null check (algorithm in ('ES256')),
  signature text not null,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null default now(),
  primary key (act_id, key_id)
);

create table if not exists continuum.checkpoints (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references continuum.institutions(id) on delete cascade,
  checkpoint_sha256 text not null unique check (checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists continuum.witness_keys (
  key_id text primary key check (key_id ~ '^[0-9a-f]{64}$'),
  witness text not null,
  jwk jsonb not null check (jsonb_typeof(jwk) = 'object'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists continuum.witness_receipts (
  checkpoint_id uuid not null references continuum.checkpoints(id) on delete cascade,
  key_id text not null references continuum.witness_keys(key_id),
  statement_sha256 text not null check (statement_sha256 ~ '^[0-9a-f]{64}$'),
  signature text not null,
  signed_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (checkpoint_id, key_id)
);

create table if not exists continuum.external_receipts (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references continuum.institutions(id) on delete cascade,
  source text not null,
  subject text not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (institution_id, source, receipt_sha256)
);

comment on table continuum.external_receipts is
  'Receipts from ADK, Cloudflare, Golden Bridge, Kubernetes, labs, or other runtimes. A receipt is evidence, not an institutional act.';
