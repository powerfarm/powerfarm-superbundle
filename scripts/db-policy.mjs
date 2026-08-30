// A porta da base de dados.
//
// Nao verifica a base -- verifica as migrations antes de la chegarem. Corre sem
// credenciais, logo pode correr em cada PR, que e onde a colisao seguinte
// seria barata de evitar.
//
// As regras existem porque ja foram quebradas, todas, nesta base:
//
//   `public` tem 19 tabelas de tres subsistemas e 42 politicas.
//   O numero 0004 foi usado por duas migrations diferentes.
//   Uma migration foi aplicada pelo SQL editor e nunca registada.
//   Convivem numeracao sequencial e timestamp na mesma tabela.
//
// Nenhuma dessas coisas foi um erro de alguem distraido. Foram tres pessoas
// (ou tres agentes) a chegar a uma base sem fronteiras e a assumir, cada um
// com razao, que ninguem tinha chegado antes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const falhas = [];
const avisos = [];
const ok = (m) => console.log(`  ok    ${m}`);
const mal = (m) => { falhas.push(m); console.log(`  FALHA ${m}`); };
const aviso = (m) => { avisos.push(m); console.log(`  aviso ${m}`); };

// Schemas que existem e nao sao nossos para tocar. O `adk` e criado pelo
// proprio motor -- §5.2: um engine nao se modifica.
const ALHEIOS = new Set(['auth', 'storage', 'realtime', 'vault', 'graphql', 'extensions', 'adk', 'supabase_migrations']);

// `public` esta FECHADO. Nao por gosto: porque ja nao tem dono.
const FECHADO = new Set(['public']);

function migrations() {
  const achadas = [];
  const anda = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && !['node_modules', '.git'].includes(e.name)) anda(p);
      else if (e.name.endsWith('.sql') && p.includes('migrations')) achadas.push(p);
    }
  };
  anda(raiz);
  return achadas.sort();
}

const ficheiros = migrations();
console.log(`\nPOLITICA DA BASE — ${ficheiros.length} migration(s)\n`);

if (ficheiros.length === 0) {
  console.log('  (nenhuma migration neste repositorio)\n');
  process.exit(0);
}

for (const f of ficheiros) {
  const rel = path.relative(raiz, f);
  const nome = path.basename(f, '.sql');
  const sql = fs.readFileSync(f, 'utf8');

  // ── numeracao por timestamp, nunca sequencial
  // Numeros sequenciais assumem um escritor unico. Ha pelo menos tres.
  if (/^\d{4}_/.test(nome)) {
    mal(`${rel}: numeracao sequencial. Ja colidiu nesta base (0004 duas vezes). Usa <YYYYMMDDHHMMSS>_<orgao>_<que>.`);
  } else if (!/^\d{14}_[a-z][a-z0-9_]*$/.test(nome)) {
    mal(`${rel}: nome fora da convencao <YYYYMMDDHHMMSS>_<orgao>_<que>`);
  } else {
    ok(`${rel}: nome com timestamp, nao colide`);
  }

  // ── nada novo aterra em public
  const criaEmPublic = [...sql.matchAll(/create\s+table\s+(?:if not exists\s+)?public\.(\w+)/gi)].map((m) => m[1]);
  if (criaEmPublic.length) {
    mal(`${rel}: cria tabela(s) em public: ${criaEmPublic.join(', ')}. public esta fechado -- usa um schema do orgao.`);
  }

  // ── declara o schema que possui
  const cria = [...sql.matchAll(/create schema (?:if not exists )?(\w+)/gi)].map((m) => m[1]);
  const tabelas = [...sql.matchAll(/create\s+table\s+(?:if not exists\s+)?(\w+)\.(\w+)/gi)];
  const schemasUsados = new Set(tabelas.map((m) => m[1].toLowerCase()));

  for (const s of schemasUsados) {
    if (FECHADO.has(s)) continue; // ja reportado acima
    if (ALHEIOS.has(s)) mal(`${rel}: escreve no schema alheio '${s}'`);
    else if (!cria.map((c) => c.toLowerCase()).includes(s)) {
      aviso(`${rel}: usa o schema '${s}' sem o criar -- depende de outra migration`);
    }
  }
  if (schemasUsados.size > 1) {
    mal(`${rel}: toca ${schemasUsados.size} schemas (${[...schemasUsados].join(', ')}). Uma migration, um orgao.`);
  } else if (schemasUsados.size === 1 && !FECHADO.has([...schemasUsados][0])) {
    ok(`${rel}: um schema proprio (${[...schemasUsados][0]})`);
  }

  // ── RLS em toda a tabela criada
  const semRls = tabelas
    .map((m) => `${m[1]}.${m[2]}`)
    .filter((t) => !new RegExp(`alter\\s+table\\s+${t.replace('.', '\\.')}\\s+enable row level security`, 'i').test(sql));
  if (semRls.length) mal(`${rel}: sem RLS: ${semRls.join(', ')}`);
  else if (tabelas.length) ok(`${rel}: ${tabelas.length} tabelas, todas com RLS`);

  // ── atribuicao obrigatoria (invariante 2b do PLANO)
  const semAutor = [];
  for (const m of tabelas) {
    const bloco = sql.slice(m.index).match(/\(([\s\S]*?)\n\);/);
    if (bloco && !/created_by\s+uuid/i.test(bloco[1])) semAutor.push(`${m[1]}.${m[2]}`);
  }
  if (semAutor.length) mal(`${rel}: sem created_by: ${semAutor.join(', ')}`);
  else if (tabelas.length) ok(`${rel}: todas as tabelas carregam created_by`);

  // ── nada escreve com service key em runtime (invariante 1 do PLANO)
  // O corpo real da funcao, entre os $$ -- nao os 800 caracteres seguintes,
  // que apanhavam o SQL de outra funcao e davam falso positivo.
  const definers = [];
  for (const m of sql.matchAll(/create or replace function\s+([\w.]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi)) {
    const [bloco, nome, corpo] = [m[0], m[1], m[2]];
    if (/security definer/i.test(bloco.slice(0, bloco.indexOf('$$')))) definers.push({ nome, corpo });
  }
  const escrita = definers.filter((d) => /\b(insert|update|delete)\s/i.test(d.corpo)).map((d) => d.nome);
  if (escrita.length) {
    aviso(`${rel}: security definer que parece escrever: ${escrita.join(', ')} -- confirma que a RLS nao esta a ser contornada`);
  } else if (definers.length) {
    ok(`${rel}: ${definers.length} security definer, so leitura`);
  }
}

console.log();
if (avisos.length) console.log(`${avisos.length} aviso(s).`);
if (falhas.length) {
  console.error(`\nPOLITICA DA BASE: FALHA — ${falhas.length} problema(s).\n` +
    'Esta base ja tem tres subsistemas em public e uma colisao de numeracao.\n' +
    'Cada regra aqui existe porque ja foi quebrada.\n');
  process.exit(1);
}
console.log('POLITICA DA BASE: PASSA\n');
