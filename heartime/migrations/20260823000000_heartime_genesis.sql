create schema if not exists heartime;

-- PowerFarm — Heartime. Schema proprio.
--
-- NAO vai para `public`. O `public` desta base tem 19 tabelas de tres
-- subsistemas diferentes, 42 politicas, duas convencoes de numeracao e pelo
-- menos uma migration aplicada sem registo. Cada um que chegou assumiu que era
-- o primeiro. Este nao assume.
--
-- O schema E a fronteira, e e o Postgres que a impoe -- nao a disciplina de
-- quem escolhe prefixos. Um orgao, um schema, um dono.
--
-- Identidade: usa `public.identidade_atual()`, que ja existe e ja esta
-- aplicada. Nao se escreve aqui uma terceira funcao para a mesma pergunta --
-- ja ha `identidade_atual()` na base e `current_identity_id()` na migration de
-- atencao por aplicar. Depender do orgao de identidade e camada correcta;
-- inventar outro nome para o mesmo conceito e doppelganger semantico.
--
-- Versao: sem numero de sequencia. Numeros de sequencia assumem um escritor
-- unico e ja colidiram aqui uma vez. O nome canonico desta migration e
-- `<timestamp>_heartime_genesis`, e o timestamp nao colide com ninguem.
--
-- O health-contract ja exige este coracao: evidencia com mais de 15 minutos
-- deixa de contar como actual, e UNKNOWN nunca pode ser mostrado como saudavel.
-- Sem um pulso, o sistema inteiro decai para UNKNOWN por definicao -- nao por
-- avaria, por passagem do tempo. O contrato foi escrito a assumir uma coisa
-- que nunca existiu. Esta migration cria-a.
--
-- Tres invariantes que este schema existe para nao deixar quebrar:
--
--   1  o prazo escreve-se na EMISSAO. Quem dorme nunca responde, logo nunca
--      se agendaria a si proprio. `due_at` e NOT NULL em `heartime_beats`.
--
--   2  o cadastro e o contrato de cobertura. Um orgao que nao esta em
--      `heartime_organs` nao recebe batimento -- e o que nao recebe batimento
--      nao pode ser declarado saudavel.
--
--   3  tudo o que age tem de ser ATRIBUIVEL. Nao "tudo tem de ser agendado":
--      essa regra seria contornada, e o contorno viraria o poder paralelo.
--      Nao-agendado com autor e um batimento extraordinario, e e legitimo.
--
-- Segue as invariantes do PLANO: nada escreve com a service key em runtime,
-- RLS ligada em toda a tabela, atribuicao obrigatoria, trigger so para
-- updated_at, e canonicalizacao na app -- o banco confere.

-- ══════════════════════════════════════════════════════════════ cadastro
-- Quem existe e pode ser observado. Registar nao e burocracia previa ao
-- trabalho: e a coisa que torna o trabalho legivel.
create table heartime.organs (
  id                text primary key check (id ~ '^pf(\.[a-z0-9][a-z0-9-]*)+$'),
  kind              text not null check (kind in ('office','service','surface','engine','channel')),
  title             text not null,

  -- Janela maxima de silencio/frescura declarada. Nao e um metronomo:
  -- passar a janela e deixar de ter evidencia actual.
  freshness_minutes   integer not null default 15 check (freshness_minutes between 1 and 43200),

  status            text not null default 'active'
                    check (status in ('active','absent','retired')),

  -- A pergunta barata. Le-se sem acordar o orgao; so quando
  -- now > next_expected + tolerancia e que se provoca um despertar caro.
  last_seen         timestamptz,
  next_expected     timestamptz,
  last_health       text check (last_health in ('HEALTHY','UNHEALTHY','UNKNOWN')),

  registered_at     timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid not null references public.identities(id)
);

create index organs_devidos
  on heartime.organs (next_expected)
  where status = 'active';

-- ═════════════════════════════════════════════════════════════ batimentos
-- A sistole. `due_at` e NOT NULL de proposito: o proximo prazo nasce quando
-- o pulso SAI. Uma fila alimentada so por respostas fica calada exactamente
-- quando o silencio e o sintoma.
create table heartime.beats (
  id            bigint generated always as identity primary key,
  organ_id      text not null references heartime.organs(id) on delete restrict,

  branch        text not null check (branch in ('parasympathetic','sympathetic')),
  probe         text not null default 'presence' check (probe in ('presence','wake','channel-test')),
  reason        text,

  sent_at       timestamptz not null default now(),
  due_at        timestamptz not null,

  -- Quem mandou bater. Um batimento sem autor nao existe.
  author        text not null,
  -- Fora de cadencia mas com autor: legitimo, e fica no mesmo livro.
  extraordinary boolean not null default false,

  created_by    uuid not null references public.identities(id)
);

create index beats_por_orgao on heartime.beats (organ_id, sent_at desc);

-- ══════════════════════════════════════════════════════════════════ ecos
-- A diastole. O que voltou, e o que passou a saber-se. E o eco que define
-- quando se volta a olhar: UNKNOWN aperta, HEALTHY relaxa.
create table heartime.echoes (
  id          bigint generated always as identity primary key,
  beat_id     bigint not null references heartime.beats(id) on delete restrict,
  organ_id    text not null references heartime.organs(id) on delete restrict,

  health      text not null check (health in ('HEALTHY','UNHEALTHY','UNKNOWN')),
  observation jsonb not null default '{}'::jsonb,

  received_at timestamptz not null default now(),
  created_by  uuid not null references public.identities(id)
);

create unique index echoes_um_por_batimento on heartime.echoes (beat_id);

-- ═════════════════════════════════════════════════════════════════ sinais
-- O ramo simpatico. Este e o canal ABERTO: quem consegue mandar um webhook
-- consegue gastar a adrenalina da empresa. Por isso a origem tem de ser
-- autenticada, nao apenas declarada -- e a hora do emissor guarda-se como
-- afirmacao, nunca como a hora do acontecimento.
create table heartime.signals (
  id            bigint generated always as identity primary key,
  source        text not null,
  authenticated boolean not null,
  trust         numeric not null default 0 check (trust between 0 and 1),

  received_at   timestamptz not null default now(),   -- hora institucional
  claimed_at    timestamptz,                          -- o que o emissor DIZ

  admitted      boolean not null,
  refusal       text,

  -- Adrenalina decai sozinha. Nenhum organismo aguenta simpatico permanente,
  -- e um incidente que ninguem fecha nao pode deixar a empresa em alta
  -- frequencia para sempre.
  adrenaline_until timestamptz,

  payload       jsonb not null default '{}'::jsonb,
  created_by    uuid not null references public.identities(id)
);

create index signals_adrenalina on heartime.signals (adrenaline_until)
  where admitted and adrenaline_until is not null;

-- ═══════════════════════════════════════════════════════════════ triggers
create or replace function heartime.touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger organs_touch before update on heartime.organs
  for each row execute function heartime.touch();

-- ═══════════════════════════════════════════════════════ varredura (level)
-- Level-triggered de proposito: pergunta "o que NAO esta como declarado",
-- nao "o que venceu". Um evento perdido e reparado na passagem seguinte sem
-- que ninguem repare que se perdeu, e uma varredura que encontra tudo certo
-- custa quase nada.
create or replace function heartime.sweep(
  p_now         timestamptz default now(),
  p_freshness   integer default null,
  p_grace       integer default 2,
  p_adrenaline  boolean default false
)
returns table (organ_id text, state text, health text, probe text)
language sql stable as $$
  select o.id,
         s.state,
         s.health,
         case when s.provoke then 'wake' else 'presence' end
    from heartime.organs o
    cross join lateral (
      select case
               when o.status = 'absent'                                              then 'absent'
               when o.last_seen is null                                              then 'unverified'
               when o.next_expected is not null
                    and p_now > o.next_expected + make_interval(mins => p_grace)     then 'overdue'
               when p_now - o.last_seen > make_interval(mins => coalesce(p_freshness, o.freshness_minutes)) then 'stale'
               else 'idle'
             end as state,
             case
               when o.status = 'absent'                                              then 'UNHEALTHY'
               when o.last_seen is null                                              then 'UNKNOWN'
               when o.next_expected is not null
                    and p_now > o.next_expected + make_interval(mins => p_grace)     then 'UNKNOWN'
               when p_now - o.last_seen > make_interval(mins => coalesce(p_freshness, o.freshness_minutes)) then 'UNKNOWN'
               else 'HEALTHY'
             end as health,
             (o.status = 'absent'
              or o.last_seen is null
              or (o.next_expected is not null
                  and p_now > o.next_expected + make_interval(mins => p_grace))
              or p_now - o.last_seen > make_interval(mins => coalesce(p_freshness, o.freshness_minutes))) as provoke
    ) s
   where o.status <> 'retired'
     -- Sob adrenalina a digestao suprime-se: manutencao saudavel espera.
     -- Descobrir que um orgao morreu nunca espera.
     and (not p_adrenaline or s.provoke)
     and (s.provoke or o.next_expected is null or p_now >= o.next_expected);
$$;

-- Quando dormir. Um coracao parado nao custa nada; um cron fixo tem de correr
-- no periodo mais apertado que alguma coisa exija, sempre, quase sempre para
-- descobrir que nao havia nada a fazer.
create or replace function heartime.next_wake(p_now timestamptz default now())
returns timestamptz language sql stable as $$
  with candidates(ts) as (
    select min(coalesce(next_expected, p_now))
      from heartime.organs
     where status = 'active'
    union all
    select min(adrenaline_until)
      from heartime.signals
     where admitted and adrenaline_until is not null and adrenaline_until > p_now
  ), earliest as (
    select min(ts) as ts from candidates where ts is not null
  )
  select case when ts is null then null else greatest(p_now, ts) end
    from earliest;
$$;

-- ══════════════════════════════════════════════════ emitir (prazo na saida)
-- Escreve o batimento E avanca `next_expected` na mesma transaccao. E aqui
-- que a invariante 1 vive: mesmo que o orgao nunca responda, ja existe prazo.
create or replace function heartime.emit(
  p_organ         text,
  p_branch        text default 'parasympathetic',
  p_probe         text default 'presence',
  p_reason        text default null,
  p_due_minutes   integer default null,
  p_extraordinary boolean default false
)
returns bigint language plpgsql security invoker as $$
declare
  v_me        uuid := public.identidade_atual();
  v_freshness integer;
  v_due       timestamptz;
  v_id        bigint;
begin
  if v_me is null then raise exception 'heartime: sem identidade'; end if;
  select freshness_minutes into v_freshness
    from heartime.organs
   where id = p_organ;
  if v_freshness is null then
    raise exception 'heartime: orgao nao registado: %', p_organ;
  end if;
  if p_due_minutes is not null and p_due_minutes < 1 then
    raise exception 'heartime: p_due_minutes invalido: %', p_due_minutes;
  end if;
  v_due := now() + make_interval(mins => coalesce(p_due_minutes, v_freshness));

  insert into heartime.beats
    (organ_id, branch, probe, reason, due_at, author, extraordinary, created_by)
  values (p_organ, p_branch, p_probe, p_reason, v_due, v_me::text, p_extraordinary, v_me)
  returning id into v_id;

  update heartime.organs set next_expected = v_due where id = p_organ;
  return v_id;
end $$;

-- ═══════════════════════════════════════════════════ eco (a taxa e derivada)
-- O eco pode ENCURTAR o proximo prazo. Nunca e a unica coisa que o cria.
create or replace function heartime.echo(
  p_beat        bigint,
  p_health      text,
  p_observation jsonb default '{}'::jsonb,
  p_freshness   integer default null
)
returns timestamptz language plpgsql security invoker as $$
declare
  v_me    uuid := public.identidade_atual();
  v_organ text;
  v_cad   integer;
  v_next  timestamptz;
begin
  if v_me is null then raise exception 'heartime: sem identidade'; end if;

  select b.organ_id into v_organ from heartime.beats b where b.id = p_beat;
  if v_organ is null then raise exception 'heartime: batimento inexistente: %', p_beat; end if;

  select freshness_minutes into v_cad from heartime.organs where id = v_organ;

  -- Amostra-se mais depressa exactamente quando se sabe menos.
  v_next := now() + case p_health
    when 'UNKNOWN'   then make_interval(mins => 1)
    when 'UNHEALTHY' then make_interval(mins => 5)
    else make_interval(mins => least(v_cad, coalesce(p_freshness, v_cad)))
  end;

  insert into heartime.echoes (beat_id, organ_id, health, observation, created_by)
  values (p_beat, v_organ, p_health, p_observation, v_me);

  update heartime.organs
     set last_seen = now(), last_health = p_health, next_expected = v_next,
         status = case when p_health = 'UNHEALTHY' and status = 'absent' then 'absent' else 'active' end
   where id = v_organ;

  return v_next;
end $$;

-- ═══════════════════════════════════════════ detector de poder paralelo
-- O orgao morto falha em seguranca: nao faz nada. O orgao paralelo age no
-- mundo sem autorizacao, sem registo e sem que ninguem saiba parar.
--
-- Nao se encontra pelo cadastro -- nao se conhece o endereco. Encontra-se
-- pelo rasto: para trabalhar tem de tocar em coisas que ESTAO registadas.
create or replace view heartime.unattributed as
  select b.id as beat_id, b.organ_id, b.author, b.sent_at,
         case
           when b.author is null                                        then 'sem-autor'
           when o.id is null                                            then 'orgao-nao-registado'
           when b.extraordinary                                         then 'extraordinario'
         end as finding,
         case when b.extraordinary then 'nota' else 'alta' end as severity
    from heartime.beats b
    left join heartime.organs o on o.id = b.organ_id
   where b.author is null or o.id is null or b.extraordinary;

-- ═══════════════════════════════════════════════════════════════════ RLS
alter table heartime.organs  enable row level security;
alter table heartime.beats   enable row level security;
alter table heartime.echoes  enable row level security;
alter table heartime.signals enable row level security;

-- O estado de saude do organismo e legivel por quem tem sessao. Esconder
-- que um orgao esta UNKNOWN nao protege nada e impede que alguem repare.
create policy organs_leitura  on heartime.organs  for select to authenticated using (true);
create policy beats_leitura   on heartime.beats   for select to authenticated using (true);
create policy echoes_leitura  on heartime.echoes  for select to authenticated using (true);
create policy signals_leitura on heartime.signals for select to authenticated using (true);

create policy organs_escrita  on heartime.organs  for insert to authenticated with check (public.eh_membro());
create policy organs_update   on heartime.organs  for update to authenticated using (public.eh_membro());
create policy beats_escrita   on heartime.beats   for insert to authenticated with check (public.eh_membro());
create policy echoes_escrita  on heartime.echoes  for insert to authenticated with check (public.eh_membro());
create policy signals_escrita on heartime.signals for insert to authenticated with check (public.eh_membro());

-- PostgreSQL privileges and RLS are separate gates. Custom schemas are not
-- automatically exposed by Supabase/PostgREST, so the runtime role receives
-- only the minimum object privileges required by the functions above. The
-- project must also explicitly expose the `heartime` schema in API settings.
revoke all on schema heartime from public, anon;
grant usage on schema heartime to authenticated;

revoke all on all tables in schema heartime from public, anon;
grant select on heartime.organs, heartime.beats, heartime.echoes, heartime.signals to authenticated;
grant insert, update on heartime.organs to authenticated;
grant insert on heartime.beats, heartime.echoes, heartime.signals to authenticated;
grant usage, select on all sequences in schema heartime to authenticated;

revoke all on all functions in schema heartime from public, anon;
grant execute on function heartime.sweep(timestamptz, integer, integer, boolean) to authenticated;
grant execute on function heartime.next_wake(timestamptz) to authenticated;
grant execute on function heartime.emit(text, text, text, text, integer, boolean) to authenticated;
grant execute on function heartime.echo(bigint, text, jsonb, integer) to authenticated;

-- Membership is reconciled from roster/organs.json after an authenticated
-- canonical IdentityRef is supplied. The migration owns schema, not desired
-- roster state, and therefore contains no personal-name bootstrap or roster seed.
