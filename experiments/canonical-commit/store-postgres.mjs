// Transactional act store backed by a real PostgreSQL engine (pglite, running
// the actual PostgreSQL query and storage engine in-process against a data
// directory on disk).
//
// Used as the canonical store in Shape B and as the downstream projection in
// Shape A.
//
// Fidelity limit, stated up front: pglite is a single-connection embedded build.
// It runs real PostgreSQL semantics for transactions, constraints and crash
// recovery, but it does NOT model a multi-connection server. Anything that
// depends on two live connections contending — real row locks across sessions,
// serialization failures, connection-pool behaviour — is therefore NOT exercised
// here and is marked as such in the report.

import { PGlite } from '@electric-sql/pglite';

const SCHEMA = `
create table if not exists acts (
  id           text primary key,
  seq          bigint not null,
  branch       text not null,
  request_id   text not null,
  kind         text not null,
  body_sha256  text not null,
  causes       text
);
create unique index if not exists acts_request on acts (branch, request_id);
create unique index if not exists acts_seq on acts (branch, seq);
create table if not exists heads (
  branch  text primary key,
  head_id text,
  seq     bigint not null
);
create table if not exists outbox (
  position bigserial primary key,
  act_id   text not null unique,
  branch   text not null
);
create table if not exists outbox_cursor (
  id       integer primary key check (id = 1),
  position bigint not null
);
create table if not exists institution (
  id              integer primary key check (id = 1),
  institution_ref text not null,
  genesis_ref     text not null,
  genesis_digest  text not null,
  initialized_at  text not null
);
`;

export async function openPostgresStore(dataDir) {
  const db = new PGlite(dataDir);
  await db.exec(SCHEMA);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0] ?? null;
  const many = async (sql, params) => (await db.query(sql, params)).rows;
  const num = (value) => (value === null || value === undefined ? value : Number(value));
  const shape = (row) => (row ? { ...row, seq: num(row.seq), position: num(row.position) } : row);

  return {
    engine: 'postgres',
    async begin() { await db.exec('begin'); },
    async commit() { await db.exec('commit'); },
    async rollback() { try { await db.exec('rollback'); } catch { /* already unwound */ } },
    async actByRequest(branch, requestId) {
      return shape(await one('select * from acts where branch = $1 and request_id = $2', [branch, requestId]));
    },
    async head(branch) {
      return shape(await one('select * from heads where branch = $1', [branch])) ?? { branch, head_id: null, seq: 0 };
    },
    async insertAct(act) {
      await db.query(
        'insert into acts (id, seq, branch, request_id, kind, body_sha256, causes) values ($1, $2, $3, $4, $5, $6, $7)',
        [act.id, act.seq, act.branch, act.request_id, act.kind, act.body_sha256, act.causes],
      );
    },
    async setHead(branch, headId, seq) {
      await db.query(
        'insert into heads (branch, head_id, seq) values ($1, $2, $3) on conflict (branch) do update set head_id = excluded.head_id, seq = excluded.seq',
        [branch, headId, seq],
      );
    },
    async appendOutbox(actId, branch) {
      await db.query('insert into outbox (act_id, branch) values ($1, $2)', [actId, branch]);
    },
    async outboxAfter(position) {
      return (await many('select * from outbox where position > $1 order by position', [position])).map(shape);
    },
    async outboxCursor() {
      return num((await one('select position from outbox_cursor where id = 1'))?.position) ?? 0;
    },
    async setOutboxCursor(position) {
      await db.query(
        'insert into outbox_cursor (id, position) values (1, $1) on conflict (id) do update set position = excluded.position',
        [position],
      );
    },
    async allActs(branch) {
      return (await many('select * from acts where branch = $1 order by seq', [branch])).map(shape);
    },
    async institution() {
      return await one('select institution_ref, genesis_ref, genesis_digest from institution where id = 1');
    },
    async initInstitution(anchor) {
      await db.query(
        'insert into institution (id, institution_ref, genesis_ref, genesis_digest, initialized_at) values (1, $1, $2, $3, $4)',
        [anchor.institution_ref, anchor.genesis_ref, anchor.genesis_digest, new Date().toISOString()],
      );
    },
    async replaceAll(branch, acts) {
      await db.exec('begin');
      await db.query('delete from acts where branch = $1', [branch]);
      for (const act of acts) {
        await db.query(
          'insert into acts (id, seq, branch, request_id, kind, body_sha256, causes) values ($1, $2, $3, $4, $5, $6, $7)',
          [act.id, act.seq, act.branch, act.request_id, act.kind, act.body_sha256, act.causes ?? null],
        );
      }
      const last = acts.at(-1) ?? null;
      await db.query(
        'insert into heads (branch, head_id, seq) values ($1, $2, $3) on conflict (branch) do update set head_id = excluded.head_id, seq = excluded.seq',
        [branch, last?.id ?? null, last?.seq ?? 0],
      );
      await db.exec('commit');
    },
    async corrupt(branch) {
      await db.query(
        'update acts set body_sha256 = $1 where branch = $2 and seq = (select min(seq) from acts where branch = $2)',
        ['sha256:' + 'f'.repeat(64), branch],
      );
    },
    async close() { await db.close(); },
  };
}
