-- PowerFarm Heartime: admit compact summaries for the permanent capability-
-- learning reconciliation seam without allowing organ-owned bodies to enter
-- Heartime state.
--
-- The existing reconciliation tables and cycle functions are intentionally
-- reused. A new seam is a new reconciler contract, not a new scheduler.

create schema if not exists heartime;

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
        'response', 'responses', 'workflow_state',
        'capability', 'implementation', 'candidate', 'profile', 'policy',
        'proposal', 'assessment', 'semantic_contract', 'authority_contract',
        'evidence_contract', 'learning_policy'
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

comment on function heartime.reconciliation_summary_is_compact(jsonb) is
  'Reference-only Heartime summary guard for attention and capability-learning reconcilers.';

revoke all on function heartime.reconciliation_summary_is_compact(jsonb) from public, anon;
grant execute on function heartime.reconciliation_summary_is_compact(jsonb) to authenticated;
