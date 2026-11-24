import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Workbench, hash } from '../src/store.mjs';
import { fixture } from './helpers.mjs';

test('read-only construction does not create a data directory',t => {
  const f = fixture(t); const missing = path.join(f.root,'missing'); const store = new Workbench(missing);
  assert.deepEqual(store.registry,{projects:[],global:null}); assert.equal(fs.existsSync(missing),false);
});
test('registration and inspection do not change project files',t => {
  const f = fixture(t); assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
  assert.throws(() => f.store.register({root:f.projectRoot}),/已经登记/);
  assert.throws(() => f.store.inspect({root:'relative'}),/绝对路径/);
  assert.throws(() => f.store.inspect({root:path.join(f.root,'absent')}),/目录不存在/);
});
test('custom rule and journal mappings are classified correctly',t => {
  const f = fixture(t); f.store.configure(f.project.id,{ruleFiles:['instructions.md'],ruleRoots:['rules'],journalDir:'docs/logs'});
  f.write('instructions.md','# Custom'); f.write('rules/ui.md','# UI');
  f.store.record(f.project.id,{title:'Change',background:'Why',result:'Done'});
  const docs = f.store.catalog(f.project.id).docs;
  assert.equal(docs.find(d => d.file === 'instructions.md').role,'rule');
  assert.ok(docs.some(d => d.file.startsWith('docs/logs/') && d.role === 'journal'));
  assert.throws(() => f.store.configure(f.project.id,{journalDir:'rules'}),/重叠/);
});
test('context includes global and project bodies, module index only; pending stays out',t => {
  const f = fixture(t); f.write('AGENTS.md','# 项目\n当前规则'); f.write('docs/agent/frontend.md','# 前端\n按需正文');
  const global = path.join(f.root,'global.md'); fs.writeFileSync(global,'# 全局\n中文沟通'); f.store.setGlobal(global);
  f.proposal({content:'# 候选\n不应注入'});
  const result = f.store.context(f.project.id);
  assert.equal(result.rules.length,2); assert.equal(result.modules.length,1);
  assert.equal(result.modules[0].content,undefined); assert.ok(!JSON.stringify(result).includes('不应注入'));
});
test('proposals stay pending until exact approval; applying preserves permissions and is idempotent',t => {
  const f = fixture(t); const file = f.write('AGENTS.md','# Original\n'); fs.chmodSync(file,0o660);
  const p = f.proposal(); assert.equal(fs.readFileSync(file,'utf8'),'# Original\n');
  f.store.apply(p.id,{baseHash:p.baseHash,contentHash:p.contentHash});
  assert.equal(fs.readFileSync(file,'utf8'),p.content); assert.equal(fs.statSync(file).mode & 0o777,0o660);
  f.store.apply(p.id,{baseHash:p.baseHash,contentHash:p.contentHash});
  assert.equal(f.store.journal(f.project.id).length,1);
});
test('approval can create a missing entry file but registration does not',t => {
  const f = fixture(t); const p = f.proposal(); assert.equal(p.baseHash,null);
  assert.equal(fs.existsSync(path.join(f.projectRoot,'AGENTS.md')),false);
  f.store.apply(p.id,p); assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),p.content);
});
test('editing a candidate invalidates the old reviewed content hash',t => {
  const f = fixture(t); f.write('AGENTS.md','Original'); const p = f.proposal();
  f.store.revise(p.id,{contentHash:p.contentHash,content:'Revised',reason:'More precise'});
  assert.throws(() => f.store.apply(p.id,p),/审核版本/); assert.equal(f.store.document(f.project.id,'AGENTS.md').content,'Original');
});
test('external edits stop approval; rebase creates a fresh pending proposal',t => {
  const f = fixture(t); f.write('AGENTS.md','Original'); const p = f.proposal(); f.write('AGENTS.md','External edit');
  assert.throws(() => f.store.apply(p.id,p),/原文/); assert.equal(f.store.proposal(p.id).status,'conflict');
  const next = f.store.rebase(p.id); assert.equal(next.status,'pending'); assert.equal(next.baseContent,'External edit');
  assert.equal(f.store.proposal(p.id).replacedBy,next.id); assert.equal(f.store.proposal(p.id).status,'superseded');
  assert.equal(f.store.document(f.project.id,'AGENTS.md').content,'External edit');
});
test('rebase closes a proposal with no remaining differences',t => {
  const f = fixture(t); const p = f.proposal(); f.write('AGENTS.md',p.content);
  const next = f.store.rebase(p.id); assert.equal(next.noChanges,true); assert.equal(f.store.proposals().length,1);
});
test('rejection retains reason and never changes the target',t => {
  const f = fixture(t); f.write('AGENTS.md','Original'); const p = f.proposal();
  assert.throws(() => f.store.reject(p.id,''),/拒绝原因/);
  f.store.reject(p.id,'仅适用于本次任务'); assert.equal(f.store.proposal(p.id).rejectionReason,'仅适用于本次任务');
  assert.equal(f.store.document(f.project.id,'AGENTS.md').content,'Original');
});
test('global remapping cannot redirect an old approval even when contents are identical',t => {
  const f = fixture(t); const a = path.join(f.root,'a.md'); const b = path.join(f.root,'b.md');
  fs.writeFileSync(a,'Same'); fs.writeFileSync(b,'Same'); f.store.setGlobal(a);
  const p = f.proposal({projectId:'global',file:'a.md',content:'New global'});
  f.store.setGlobal(b); assert.throws(() => f.store.apply(p.id,p)); assert.equal(fs.readFileSync(b,'utf8'),'Same');
});
test('recovery completes an approved write and logs exactly once',t => {
  const f = fixture(t,{afterWrite:() => {throw Error('simulated crash');}}); const p = f.proposal();
  assert.throws(() => f.store.apply(p.id,p),/simulated/);
  const restarted = new Workbench(f.data); assert.equal(restarted.proposal(p.id).status,'pending');
  restarted.recover(); assert.equal(restarted.proposal(p.id).status,'applied'); restarted.recover();
  assert.equal(restarted.journal(f.project.id).length,1);
});
test('recovery never overwrites edits made after an interrupted write',t => {
  const f = fixture(t,{afterWrite:() => {throw Error('crash');}}); const p = f.proposal();
  assert.throws(() => f.store.apply(p.id,p)); f.write('AGENTS.md','User subsequent edit');
  const restarted = new Workbench(f.data); restarted.recover();
  assert.equal(restarted.proposal(p.id).status,'conflict'); assert.equal(restarted.document(f.project.id,'AGENTS.md').content,'User subsequent edit');
});
test('journal failure after target write can be repaired without a second target write',t => {
  const f = fixture(t,{afterWrite:() => f.write('logs','blocking file')}); f.store.configure(f.project.id,{journalDir:'logs'}); const p = f.proposal();
  assert.throws(() => f.store.apply(p.id,p));
  assert.equal(f.store.document(f.project.id,'AGENTS.md').content,p.content);
  fs.unlinkSync(path.join(f.projectRoot,'logs')); const restarted = new Workbench(f.data); restarted.recover();
  assert.equal(restarted.proposal(p.id).status,'applied'); assert.equal(restarted.journal(f.project.id).length,1);
});
test('path escapes, ordinary symlinks and dangling symlinks are rejected',t => {
  const f = fixture(t); const outside = path.join(f.root,'outside.md'); fs.writeFileSync(outside,'private');
  fs.mkdirSync(path.join(f.projectRoot,'docs/agent'),{recursive:true});
  fs.symlinkSync(outside,path.join(f.projectRoot,'docs/agent/link.md'));
  fs.symlinkSync(path.join(f.root,'absent'),path.join(f.projectRoot,'docs/agent/dangling.md'));
  for (const file of ['../outside.md','docs/agent/link.md','docs/agent/dangling.md']) assert.throws(() => f.proposal({file}));
});
test('superseded module documents are not returned as effective context',t => {
  const f = fixture(t); f.write('AGENTS.md','# Root');
  f.write('docs/agent/old.md','---\nstatus: superseded\nsuperseded_by: docs/agent/new.md\n---\n# Old'); f.write('docs/agent/new.md','# New');
  assert.deepEqual(f.store.context(f.project.id).modules.map(d => d.file),['docs/agent/new.md']);
});
test('journal parser ignores headings inside fenced code',t => {
  const f = fixture(t); f.write('docs/maintenance/2026-11.md','# 日志\n\n## 2026-11-24 · One\n\n```md\n## Not a record\n```\n\n## 2026-11-23 · Two\n\nDone');
  assert.equal(f.store.journal(f.project.id).length,2);
});
test('search returns source-linked documents and proposals',t => {
  const f = fixture(t); f.write('AGENTS.md','# Root\n保留已有修改'); const p = f.proposal();
  const hits = f.store.search(f.project.id,'保留').hits;
  assert.ok(hits.some(h => h.file === 'AGENTS.md' && h.kind === 'document'));
  assert.ok(hits.some(h => h.proposalId === p.id)); assert.equal(f.store.search(f.project.id,'无匹配').hits.length,0);
});
test('candidate byte limits correctly handle multibyte text',t => {
  const f = fixture(t); assert.throws(() => f.proposal({content:'中'.repeat(170000)}),/500 KB/);
  assert.equal(hash(null),null);
});
test('pending work prevents unregistering a project; settled work does not',t => {
  const f = fixture(t); const p = f.proposal(); assert.throws(() => f.store.remove(f.project.id),/先处理/);
  f.store.reject(p.id,'No longer needed'); f.store.remove(f.project.id);
  assert.equal(f.store.registry.projects.length,0); assert.ok(fs.existsSync(f.projectRoot));
});
test('record payload cannot redirect the journal into a rule or arbitrary global file',t => {
  const f = fixture(t); const rule = f.write('AGENTS.md','Original rule');
  f.store.record(f.project.id,{title:'Record',background:'Why',result:'Done',journalFile:rule});
  assert.equal(fs.readFileSync(rule,'utf8'),'Original rule');
  const global = path.join(f.root,'global.md'); fs.writeFileSync(global,'Original global'); f.store.setGlobal(global);
  f.store.record('global',{title:'Record',background:'Why',result:'Done',journalFile:global});
  assert.equal(fs.readFileSync(global,'utf8'),'Original global');
});
test('an actual process exit leaves a recoverable lock and approved write',t => {
  const f = fixture(t); const p = f.proposal();
  const code = `import { Workbench } from ${JSON.stringify(new URL('../src/store.mjs',import.meta.url).href)}; const store = new Workbench(process.argv[1],{afterWrite:() => process.exit(73)}); const p = store.proposal(process.argv[2]); store.apply(p.id,p);`;
  const child = spawnSync(process.execPath,['--input-type=module','--eval',code,f.data,p.id],{encoding:'utf8'});
  assert.equal(child.status,73,child.stderr); assert.ok(fs.existsSync(path.join(f.data,'.write-lock')));
  const restarted = new Workbench(f.data); restarted.recover();
  assert.equal(restarted.proposal(p.id).status,'applied'); assert.equal(restarted.journal(f.project.id).length,1);
});
test('an interrupted approved transaction cannot be edited or rejected before repair',t => {
  const f = fixture(t,{afterWrite:() => {throw Error('crash');}}); const p = f.proposal(); assert.throws(() => f.store.apply(p.id,p));
  assert.equal(f.store.diff(p.id).applicationPending,true);
  assert.throws(() => f.store.revise(p.id,{content:'Other',contentHash:p.contentHash}),/部分写入/);
  assert.throws(() => f.store.reject(p.id,'Reject later'),/部分写入/); assert.throws(() => f.store.rebase(p.id),/部分写入/);
  const restarted = new Workbench(f.data); restarted.apply(p.id,p);
  assert.equal(restarted.proposal(p.id).status,'applied'); assert.equal(restarted.journal(f.project.id).length,1);
});
