import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const START='<!-- POWERFARM-MAP:START -->';
const END='<!-- POWERFARM-MAP:END -->';
const COPYRIGHT='Copyright © 2026 PowerFarm. All rights reserved.';
const errors=[];
const posix=p=>p.split(path.sep).join('/');
const upstream=rel=>rel.startsWith('engines/ai-sdk/upstream/');
const generated=rel=>rel.includes('/.pytest_cache/')||rel.startsWith('.pytest_cache/');

function walk(dir){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name==='.git'||e.name==='node_modules') continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory()) out.push(...walk(p));
    else if(e.isFile()&&e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}
function count(text,needle){return text.split(needle).length-1;}
function checkMapLinks(file,text){
  const s=text.indexOf(START), e=text.indexOf(END);
  if(s<0||e<s) return;
  const block=text.slice(s,e+END.length);
  for(const m of block.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
    const href=m[1];
    if(/^(?:https?:|mailto:|#)/.test(href)) continue;
    const clean=decodeURIComponent(href.split('#')[0]);
    const target=path.resolve(path.dirname(file),clean);
    if(!fs.existsSync(target)) errors.push(`${posix(path.relative(root,file))}: broken map link ${href}`);
  }
}
if(!fs.existsSync(path.join(root,'DOCUMENTATION.md'))) errors.push('DOCUMENTATION.md is required at repository root');
let ownedCount=0, upstreamCount=0, generatedCount=0;
for(const file of walk(root)){
  const rel=posix(path.relative(root,file));
  const text=fs.readFileSync(file,'utf8');
  if(upstream(rel)){
    upstreamCount++;
    if(text.includes(START)||text.includes(COPYRIGHT)) errors.push(`${rel}: upstream engine documentation was PowerFarm-normalized`);
    continue;
  }
  if(generated(rel)){generatedCount++; continue;}
  ownedCount++;
  if(count(text,START)!==1||count(text,END)!==1) errors.push(`${rel}: missing or duplicated PowerFarm map block`);
  if(count(text,COPYRIGHT)!==1) errors.push(`${rel}: missing or duplicated PowerFarm copyright`);
  checkMapLinks(file,text);
}
if(errors.length){
  console.error(`Documentation conformance failed (${errors.length}):`);
  for(const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`Documentation conformance OK: ${ownedCount} PowerFarm Markdown files mapped; ${upstreamCount} upstream AI SDK docs untouched; ${generatedCount} generated files exempt.`);
