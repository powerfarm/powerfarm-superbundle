-- Read boundary. Admission writes are deliberately NOT exposed to anon/authenticated.
-- A future admission service gets a dedicated database role and transaction contract.
-- REVIEW ONLY.

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

-- Temporary company-wide read policy. Replace with institutional/workspace scope
-- before any multi-tenant use. Writes remain unavailable through PostgREST.
do $$
declare
  t text;
begin
  foreach t in array array[
    'institutions','timelines','acts','act_causes','act_signatures',
    'checkpoints','witness_keys','witness_receipts','external_receipts'
  ] loop
    execute format('drop policy if exists authenticated_read on continuum.%I', t);
    execute format('create policy authenticated_read on continuum.%I for select to authenticated using (true)', t);
  end loop;
end $$;

create or replace view continuum.timeline_heads
with (security_invoker = true)
as
select distinct on (institution_id, timeline_id)
  institution_id,
  timeline_id,
  id as head_act_id,
  timeline_index,
  sha256 as head_sha256,
  recorded_at
from continuum.acts
order by institution_id, timeline_id, timeline_index desc;

grant select on continuum.timeline_heads to authenticated;

create or replace view continuum.act_support_edges
with (security_invoker = true)
as
select act_id, cause_act_id as support_act_id, relation
from continuum.act_causes
union all
select act_id, null::uuid as support_act_id, 'signature:' || key_id::text as relation
from continuum.act_signatures;

grant select on continuum.act_support_edges to authenticated;
