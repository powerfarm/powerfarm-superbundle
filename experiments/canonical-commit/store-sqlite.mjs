// Embedded transactional act store, backed by node:sqlite.
//
// Used as the canonical store in Shape A and as the downstream projection in
// Shape B. The two roles share one implementation deliberately: the experiment
// is about *where the canonical commit is*, not about which engine is nicer.

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
create table if not exists acts (
  id           text primary key,
  seq          integer not null,
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
  seq     integer not null
);
create table if not exists outbox (
  position integer primary key autoincrement,
  act_id   text not null unique,
  branch   text not null
);
create table if not exists outbox_cursor (
  id       integer primary key check (id = 1),
  position integer not null
);
create table if not exists institution (
  id              integer primary key check (id = 1),
  institution_ref text not null,
  genesis_ref     text not null,
  genesis_digest  text not null,
  initialized_at  text not null
);
`;

export function openSqliteStore(file) {
  const db = new DatabaseSync(file);
  // Durability is the whole point of this experiment, so the store is opened
  // with the strongest ordinary settings rather than the fastest ones.
  db.exec('pragma journal_mode = WAL');
  db.exec('pragma synchronous = FULL');
  db.exec('pragma foreign_keys = ON');
  db.exec(SCHEMA);

  return {
    engine: 'sqlite',
    async begin() { db.exec('begin immediate'); },
    async commit() { db.exec('commit'); },
    async rollback() { try { db.exec('rollback'); } catch { /* already unwound */ } },
    async actByRequest(branch, requestId) {
      return db.prepare('select * from acts where branch = ? and request_id = ?').get(branch, requestId) ?? null;
    },
    async head(branch) {
      return db.prepare('select * from heads where branch = ?').get(branch) ?? { branch, head_id: null, seq: 0 };
    },
    async insertAct(act) {
      db.prepare('insert into acts (id, seq, branch, request_id, kind, body_sha256, causes) values (?, ?, ?, ?, ?, ?, ?)')
        .run(act.id, act.seq, act.branch, act.request_id, act.kind, act.body_sha256, act.causes);
    },
    async setHead(branch, headId, seq) {
      db.prepare('insert into heads (branch, head_id, seq) values (?, ?, ?) on conflict(branch) do update set head_id = excluded.head_id, seq = excluded.seq')
        .run(branch, headId, seq);
    },
    async appendOutbox(actId, branch) {
      db.prepare('insert into outbox (act_id, branch) values (?, ?)').run(actId, branch);
    },
    async outboxAfter(position) {
      return db.prepare('select * from outbox where position > ? order by position').all(position);
    },
    async outboxCursor() {
      return db.prepare('select position from outbox_cursor where id = 1').get()?.position ?? 0;
    },
    async setOutboxCursor(position) {
      db.prepare('insert into outbox_cursor (id, position) values (1, ?) on conflict(id) do update set position = excluded.position').run(position);
    },
    async allActs(branch) {
      return db.prepare('select * from acts where branch = ? order by seq').all(branch);
    },
    async institution() {
      return db.prepare('select institution_ref, genesis_ref, genesis_digest from institution where id = 1').get() ?? null;
    },
    async initInstitution(anchor) {
      db.prepare('insert into institution (id, institution_ref, genesis_ref, genesis_digest, initialized_at) values (1, ?, ?, ?, ?)')
        .run(anchor.institution_ref, anchor.genesis_ref, anchor.genesis_digest, new Date().toISOString());
    },
    async replaceAll(branch, acts) {
      db.exec('begin immediate');
      db.prepare('delete from acts where branch = ?').run(branch);
      for (const act of acts) {
        db.prepare('insert into acts (id, seq, branch, request_id, kind, body_sha256, causes) values (?, ?, ?, ?, ?, ?, ?)')
          .run(act.id, act.seq, act.branch, act.request_id, act.kind, act.body_sha256, act.causes ?? null);
      }
      const last = acts.at(-1) ?? null;
      db.prepare('insert into heads (branch, head_id, seq) values (?, ?, ?) on conflict(branch) do update set head_id = excluded.head_id, seq = excluded.seq')
        .run(branch, last?.id ?? null, last?.seq ?? 0);
      db.exec('commit');
    },
    async corrupt(branch) {
      db.prepare('update acts set body_sha256 = ? where branch = ? and seq = (select min(seq) from acts where branch = ?)')
        .run('sha256:' + 'f'.repeat(64), branch, branch);
    },
    async close() { db.close(); },
  };
}
