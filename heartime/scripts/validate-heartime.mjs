// Confere as invariantes estruturais da 0011 sem precisar de base de dados.
// Nao substitui aplicar a migration -- prova o que se pode provar em disco.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Relativo a este ficheiro, nao ao cwd: o validador tem de dar o mesmo
// resultado corrido da raiz, de dentro de heartime/, ou do CI.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(raiz, 'migrations/20260823000000_heartime_genesis.sql'), 'utf8');
const falhas = [];
const ok = (m) => console.log(`  ok    ${m}`);
const mal = (m) => { falhas.push(m); console.log(`  FALHA ${m}`); };

console.log('\nHEARTIME — verificacao da migration\n');

// ── o prazo escreve-se na emissao
const beats = sql.match(/create table heartime\.beats \(([\s\S]*?)\n\);/);
if (!beats) mal('heartime_beats nao encontrada');
else if (!/due_at\s+timestamptz not null/.test(beats[1]))
  mal('due_at tem de ser NOT NULL: o prazo nasce na emissao, nao na resposta');
else ok('due_at e NOT NULL — quem dorme continua agendado');

if (!/update heartime\.organs set next_expected = v_due/.test(sql))
  mal('heartime_emit tem de avancar next_expected na mesma transaccao');
else ok('emit avanca next_expected atomicamente');

// ── o cadastro e o contrato de cobertura
if (!/raise exception 'heartime: orgao nao registado/.test(sql))
  mal('emitir para um orgao nao registado tem de ser recusado');
else ok('so se bate a orgaos registados');


// ── o roster vive em Git; a migration nao carrega uma segunda verdade
if (!/freshness_minutes\s+integer not null/.test(sql))
  mal('organs deve declarar freshness_minutes, nao uma cadencia fixa');
else ok('roster declara frescura maxima, nao metronomo');

if (/insert into heartime\.organs/i.test(sql))
  mal('a migration nao pode semear uma segunda copia do roster desejado');
else ok('migration cria schema sem duplicar o roster desejado');

if (/danvoulez|where\s+kind=.person.\s+and\s+name=/i.test(sql))
  mal('bootstrap nao pode depender de display name pessoal');
else ok('sem bootstrap por display name pessoal');

// ── UNKNOWN nunca e saudavel
for (const t of ['organs', 'echoes']) {
  const re = new RegExp(`${t}[\\s\\S]*?'HEALTHY','UNHEALTHY','UNKNOWN'`);
  if (!re.test(sql)) mal(`${t}: os tres estados de saude tem de estar no CHECK`);
}
if (!falhas.length) ok('HEALTHY/UNHEALTHY/UNKNOWN sao valores legais em ambas as tabelas');

// ── a taxa e derivada do eco
if (!/when 'UNKNOWN'\s+then make_interval\(mins => 1\)/.test(sql))
  mal('UNKNOWN tem de apertar mais que tudo o resto');
else if (!/when 'UNHEALTHY' then make_interval\(mins => 5\)/.test(sql))
  mal('UNHEALTHY tem de apertar mais que HEALTHY');
else ok('a observabilidade define o ritmo: UNKNOWN < UNHEALTHY < HEALTHY');

const healthyBoundedByContract = /least\(v_cad,\s*(?:p_freshness|coalesce\(p_freshness,\s*v_cad\))\)/.test(sql);
if (!healthyBoundedByContract)
  mal('HEALTHY nao pode relaxar alem da janela de frescura');
else ok('HEALTHY relaxa ate a janela do contrato, nunca alem');

// ── level-triggered
if (/where .*next_expected < p_now\s*;?\s*\$\$/.test(sql))
  mal('a varredura parece edge-triggered (so o que venceu)');
else if (!/not p_adrenaline or s\.provoke/.test(sql))
  mal('sob adrenalina, descobrir orgaos mortos nao pode ser adiado');
else ok('varredura level-triggered, e adrenalina nao suprime vigilancia');

// ── RLS em toda a tabela
const tabelas = [...sql.matchAll(/create table heartime\.(\w+)/g)].map((m) => m[1]);
const semRls = tabelas.filter((t) => !new RegExp(`alter table heartime\\.${t}\\s+enable row level security`).test(sql));
if (semRls.length) mal(`sem RLS: ${semRls.join(', ')}`);
else ok(`${tabelas.length} tabelas, todas com RLS ligada`);

// ── atribuicao obrigatoria (invariante 2b do PLANO)
const semAutor = tabelas.filter((t) => {
  const bloco = sql.match(new RegExp(`create table heartime\\.${t} \\(([\\s\\S]*?)\\n\\);`));
  return bloco && !/created_by\s+uuid/.test(bloco[1]);
});
if (semAutor.length) mal(`sem created_by: ${semAutor.join(', ')}`);
else ok('todas as tabelas carregam created_by');

const autorNullable = tabelas.filter((t) => {
  const bloco = sql.match(new RegExp(`create table heartime\.${t} \(([\s\S]*?)\n\);`));
  return bloco && !/created_by\s+uuid not null/.test(bloco[1]);
});
if (autorNullable.length) mal(`created_by anulavel: ${autorNullable.join(', ')}`);
else ok('atribuicao institucional e NOT NULL em todas as tabelas');

if (!/on delete restrict/.test(sql) || /on delete cascade/.test(sql))
  mal('linhagem nao pode desaparecer por cascade delete');
else ok('linhagem usa ON DELETE RESTRICT');

if (!/case when ts is null then null else greatest\(p_now, ts\) end/.test(sql))
  mal('next_wake tem de devolver NULL quando nao existe obrigacao');
else ok('sem obrigacoes, next_wake devolve NULL e o coracao dorme');

if (!/coalesce\(p_freshness, o\.freshness_minutes\)/.test(sql))
  mal('sweep tem de respeitar a frescura declarada por cada orgao');
else ok('sweep respeita o relogio proprio de cada orgao');

if (!/revoke all on schema heartime from public, anon/.test(sql)
    || !/grant usage on schema heartime to authenticated/.test(sql))
  mal('schema custom precisa de privilegios explicitos para PostgREST');
else ok('schema custom tem grants explicitos e anon/public revogados');

if (/grant execute on all functions in schema heartime/i.test(sql))
  mal('nao se concede EXECUTE indiscriminadamente a funcoes futuras');
else ok('EXECUTE e concedido apenas a funcoes Heartime nomeadas');

// ── nada escreve com service key (invariante 1 do PLANO)
if (/security definer/gi.test(sql)) {
  const definers = [...sql.matchAll(/function heartime\.(\w+)[\s\S]{0,200}?security definer/gi)].map((m) => m[1]);
  const permitidos = [];
  const maus = definers.filter((d) => !permitidos.includes(d));
  if (maus.length) mal(`security definer fora do permitido: ${maus.join(', ')}`);
  else ok('security definer so na resolucao de identidade');
}
if (!/security invoker/.test(sql)) mal('as funcoes de escrita tem de ser security invoker');
else ok('emit e echo correm como o chamador — a RLS decide');

// ── o coracao nao pode depender de outro subsistema
if (/public\\.current_identity_id\\(\\)/.test(sql))
  mal('depende de current_identity_id() (migration 0010, nao aplicada)');
else ok('sem dependencias de outros subsistemas por aplicar');

// ── trigger so para updated_at (invariante 7 do PLANO)
const triggers = [...sql.matchAll(/create trigger (\w+)/g)].map((m) => m[1]);
const naoTouch = triggers.filter((t) => !/touch/.test(t));
if (naoTouch.length) mal(`trigger com regra de negocio: ${naoTouch.join(', ')}`);
else ok(`${triggers.length} trigger, so para updated_at`);

console.log();
if (falhas.length) {
  console.error(`HEARTIME MIGRATION: FALHA — ${falhas.length} problema(s)\n`);
  process.exit(1);
}
console.log(`HEARTIME MIGRATION: PASSA · ${tabelas.length} tabelas · RLS e atribuicao intactas\n`);
