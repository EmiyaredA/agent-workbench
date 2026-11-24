import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyNotes, planArchive, applyArchive } from '../src/notes.mjs';
import { fixture } from './helpers.mjs';

const old='.agents/notes/implemented/architecture/2026-11-20-files.md';
const next='.agents/notes/implemented/architecture/2026-11-25-receipts.md';
const archived=old.replace('/implemented/','/archived/');
const manifest='.agents/notes/archived/manifest.json';
const body=(status='implemented')=>`# Agent Note: 文件为事实来源\n\nStatus: ${status}\n\n## Problem\n\n跨进程需要一致来源。\n\n## ${status === 'implemented' ? 'Decision' : 'Proposal'}\n\n文件保存正式内容。\n\n## Alternatives considered\n\n集中数据库易于查询，但当前文件交接更直接。\n\n${status === 'implemented' ? '## Consequences\n\n可直接交接，但需处理写入冲突。' : '## Acceptance criteria\n\n核对文件版本。\n\n## Risks\n\n并发冲突。'}\n`;
const setup=t=>{ const f=fixture(t); f.write(old,body()); f.write(next,body()); return f; };
const archive=f=>planArchive(f.store,f.project.id,{file:old,successor:next,date:'2026-11-25'});
const read=(f,file)=>fs.readFileSync(path.join(f.projectRoot,file),'utf8');
const digest=text=>'sha256:'+createHash('sha256').update(text).digest('hex');
function interrupt(f,plan) {
  const operationId=digest(JSON.stringify(plan)).slice(7);
  fs.mkdirSync(path.join(f.data,'note-archives'),{recursive:true});
  fs.writeFileSync(path.join(f.data,'note-archives',operationId+'.json'),JSON.stringify({plan,complete:false}));
  for (const change of plan.changes.filter(change=>change.after!==null)) f.write(change.file,change.after);
}

test('note verification handles lifecycle transitions, aliases and opaque example headings',t=>{
  const f=setup(t); const proposed='.agents/notes/proposed/feature/2026-11-25-api.md';
  f.write(proposed,body('proposed')+'\n```md\n## Plan\nStatus: implemented\n```\n\n> ## Plan\n\n<!--\n## Plan\n-->\n');
  assert.equal(verifyNotes(f.store,f.project.id).ok,true);
  const implemented=proposed.replace('/proposed/','/implemented/');
  f.write(implemented,read(f,proposed).replace('Status: proposed','Status: implemented'));
  fs.unlinkSync(path.join(f.projectRoot,proposed));
  assert.equal(verifyNotes(f.store,f.project.id).ok,false,'status alone cannot complete a proposal');
  f.write(implemented,body().replace('## Problem','## 问题').replace('## Decision','## 决策').replace('## Alternatives considered','## 备选方案'));
  const rejected='.agents/notes/rejected/feature/2026-11-25-rejected.md';
  f.write(rejected,body('proposed').replace('Status: proposed','Status: rejected — 已有实现覆盖需求'));
  assert.equal(verifyNotes(f.store,f.project.id).ok,true);
  f.write(rejected,read(f,rejected).replace(' — 已有实现覆盖需求',''));
  assert.equal(verifyNotes(f.store,f.project.id).ok,false);
});

test('note verifier rejects bad paths, dates, missing alternatives and live dead links',t=>{
  const f=setup(t);
  f.write('.agents/notes/implemented/refactor/2026-11-25-extra.md',body());
  f.write('.agents/notes/implemented/testing/2026-02-30-impossible.md',body());
  f.write('.agents/notes/INDEX.md','# Index');
  f.write(next,body().replace('## Alternatives considered','## Something else')+'\n[missing](./absent.md)\n');
  const result=verifyNotes(f.store,f.project.id);
  assert.equal(result.ok,false); assert.ok(result.errors.length>=5);
  assert.ok(result.errors.some(error=>error.includes('链接目标不存在')));
  assert.ok(result.errors.some(error=>error.includes('日期无效')));
});

test('archive preview is read-only; apply preserves frozen bytes, seals and reports all registered inbound links',t=>{
  const f=setup(t); const raw='\uFEFF'+body().replaceAll('\n','\r\n'); f.write(old,raw);
  f.write('docs/maintenance/2026-11.md',`# 日志\n\n[old](../../${old})\n`);
  const plan=archive(f);
  assert.ok(plan.inbound.includes('docs/maintenance/2026-11.md'));
  assert.equal(fs.existsSync(path.join(f.projectRoot,archived)),false);
  assert.equal(read(f,old),raw); assert.equal(fs.existsSync(path.join(f.data,'note-archives')),false);
  const applied=applyArchive(f.store,f.project.id,plan); assert.equal(applied.replayed,false);
  assert.equal(read(f,archived),raw.replace('Status: implemented\r\n','Status: implemented\r\nArchived: 2026-11-25\r\n'));
  assert.equal(fs.existsSync(path.join(f.projectRoot,old)),false);
  assert.equal(JSON.parse(read(f,manifest)).files[archived.slice('.agents/notes/'.length)],digest(read(f,archived)));
  assert.match(read(f,next),/历史快照/);
  assert.equal(verifyNotes(f.store,f.project.id).ok,false,'log link repair is a separate required step');
  f.write('docs/maintenance/2026-11.md',`# 日志\n\n[history](../../${archived})\n`);
  assert.equal(verifyNotes(f.store,f.project.id).ok,true);
  const updated=read(f,next)+'\n后续事实。\n'; f.write(next,updated);
  assert.equal(applyArchive(f.store,f.project.id,plan).replayed,true);
  assert.equal(read(f,next),updated,'completed retry must preserve later edits');
});

test('archive rejects stale or tampered plans without starting writes',t=>{
  const f=setup(t); const plan=archive(f);
  const changed=structuredClone(plan); changed.changes[0].after='# Injected';
  assert.throws(()=>applyArchive(f.store,f.project.id,changed),/计划已变化/);
  f.write(next,body()+'\n用户新编辑\n');
  assert.throws(()=>applyArchive(f.store,f.project.id,plan),/计划已变化/);
  assert.equal(fs.existsSync(path.join(f.projectRoot,archived)),false);
  assert.match(read(f,next),/用户新编辑/);
});

test('interrupted archive resumes expected before/after states and preserves external edits on conflict',t=>{
  const f=setup(t); const plan=archive(f); interrupt(f,plan);
  assert.equal(verifyNotes(f.store,f.project.id).ok,false,'unfinished receipt cannot be reported as completed');
  assert.equal(applyArchive(f.store,f.project.id,plan).ok,true);
  assert.equal(verifyNotes(f.store,f.project.id).ok,true);
  const g=setup(t); const plan2=archive(g); interrupt(g,plan2);
  g.write(old,body()+'\n用户新编辑\n');
  assert.throws(()=>applyArchive(g.store,g.project.id,plan2),/外部修改/);
  assert.match(read(g,old),/用户新编辑/);
  assert.equal(read(g,archived),plan2.changes.find(change=>change.file===archived).after);
});

test('archive cannot bypass registered rules, follow symlinks or archive a pending proposal',t=>{
  const f=setup(t);
  const proposed=old.replace('/implemented/','/proposed/'); f.write(proposed,body('proposed'));
  assert.throws(()=>planArchive(f.store,f.project.id,{file:proposed}),/只能归档/);
  assert.throws(()=>planArchive(f.store,f.project.id,{file:old,successor:old}),/另一篇/);
  f.store.configure(f.project.id,{ruleRoots:['.agents/notes']});
  assert.throws(()=>archive(f),/已登记约束/);
  const g=setup(t); const outside=path.join(g.root,'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside,path.join(g.projectRoot,'.agents/notes/archived'));
  assert.throws(()=>archive(g),/符号链接/);
  assert.deepEqual(fs.readdirSync(outside),[]);
});

test('archive refuses corruption, collisions and missing historical seals',t=>{
  const f=setup(t); applyArchive(f.store,f.project.id,archive(f));
  f.write(archived,read(f,archived)+'\n篡改\n');
  assert.equal(verifyNotes(f.store,f.project.id).ok,false);
  assert.throws(()=>planArchive(f.store,f.project.id,{file:next}),/封印|哈希/);
  const g=setup(t); g.write(archived,body().replace('Status: implemented','Status: implemented\nArchived: 2026-11-25'));
  assert.equal(verifyNotes(g.store,g.project.id).ok,false);
  assert.throws(()=>archive(g),/不能覆盖/);
  const h=setup(t); const initial=body(); h.write(old,initial+'x'.repeat(999999-Buffer.byteLength(initial)));
  assert.throws(()=>archive(h),/归档结果超过/);
  assert.equal(fs.existsSync(path.join(h.projectRoot,archived)),false);
});

test('Git baseline catches changed seals even when disk and current manifest agree',t=>{
  const f=setup(t); applyArchive(f.store,f.project.id,archive(f));
  const git=args=>execFileSync('git',args,{cwd:f.projectRoot,stdio:'pipe'});
  git(['init']); git(['add','.']); git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixture archive baseline']);
  assert.equal(verifyNotes(f.store,f.project.id).ok,true);
  f.write(archived,read(f,archived)+'\n伪造历史\n');
  const seals=JSON.parse(read(f,manifest)); seals.files[archived.slice('.agents/notes/'.length)]=digest(read(f,archived));
  f.write(manifest,JSON.stringify(seals));
  assert.equal(verifyNotes(f.store,f.project.id).ok,false);
  assert.ok(verifyNotes(f.store,f.project.id).errors.some(error=>error.includes('修改或移除了封印')));
  assert.equal(verifyNotes(f.store,f.project.id,{baseRef:'missing-reference'}).ok,false);
});

test('Skill CLI offers working verification and archive plans from an unrelated cwd, with no constraint approval',t=>{
  const f=setup(t); const script=path.resolve('skills/agent-workbench/scripts/workbench.mjs');
  const run=args=>spawnSync(process.execPath,[script,'notes','--project',f.project.id,'--data',f.data,...args],{cwd:f.root,encoding:'utf8'});
  const verified=run(['--action','verify']); assert.equal(verified.status,0,verified.stderr); assert.equal(JSON.parse(verified.stdout).ok,true);
  const preview=run(['--action','archive','--file',old,'--successor',next]); assert.equal(preview.status,0,preview.stderr);
  const input=path.join(f.root,'plan.json'); fs.writeFileSync(input,preview.stdout);
  const applied=run(['--action','apply','--input',input]); assert.equal(applied.status,0,applied.stderr);
  assert.equal(JSON.parse(applied.stdout).ok,true);
  assert.equal(run(['--action','approve']).status,1);
  f.write(archived,read(f,archived)+'\n外部修改\n'); assert.equal(run(['--action','verify']).status,1);
});
