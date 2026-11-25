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
test('project sources are fixed and custom directory inputs are rejected',t => {
  const f = fixture(t);
  for (const [key,value] of Object.entries({ruleFiles:['instructions.md'],ruleRoots:['rules'],journalDir:'docs/logs'})) {
    assert.throws(() => f.store.configure(f.project.id,{[key]:value}),/不支持的项目设置/);
    assert.throws(() => f.store.register({root:f.projectRoot,[key]:value}),/不支持的项目设置/);
  }
  const saved=JSON.parse(fs.readFileSync(f.store.registryFile,'utf8')).projects[0];
  for (const key of ['ruleFiles','ruleRoots','journalDir']) assert.equal(saved[key],undefined);
  f.write('AGENTS.md','# Entry'); f.write('.agent-workbench/rules/ui.md','# UI');
  const result=f.store.record(f.project.id,{title:'Change',category:'testing',background:'Why',result:'Done'});
  assert.match(result.file,/^docs\/maintenance\/\d{4}-\d{2}\.md$/);
  assert.equal(f.store.catalog(f.project.id).docs.find(d=>d.file===result.file).role,'journal');
});
test('context includes global and project bodies, module index only; pending stays out',t => {
  const f = fixture(t); f.write('AGENTS.md','# 项目\n当前规则'); f.write('.agent-workbench/rules/frontend.md','# 前端\n按需正文');
  const global = path.join(f.root,'global.md'); fs.writeFileSync(global,'# 全局\n中文沟通'); f.store.setGlobal(global);
  f.proposal({content:'# 候选\n不应注入'});
  const result = f.store.context(f.project.id);
  assert.equal(result.rules.length,2); assert.equal(result.modules.length,1);
  assert.equal(result.modules[0].content,undefined); assert.ok(!JSON.stringify(result).includes('不应注入'));
});
test('explicit reference documents can be read without becoming active rules or writable targets',t=>{
  const f=fixture(t); f.write('AGENTS.md','# Entry'); f.write('docs/api.md','# API\nPublic contract'); f.write('docs/decisions.md','# Historical decisions');
  f.store.configure(f.project.id,{referenceFiles:['docs/api.md','docs/decisions.md']});
  assert.equal(f.store.document(f.project.id,'docs/api.md').content,'# API\nPublic contract');
  assert.equal(f.store.catalog(f.project.id).docs.find(d=>d.file==='docs/api.md').role,'document');
  assert.equal(f.store.context(f.project.id).rules.length,1); assert.equal(f.store.context(f.project.id).modules.length,0);
  assert.throws(()=>f.proposal({file:'docs/api.md'}),/约束入口或模块/);
  assert.throws(()=>f.store.writeChange({projectId:f.project.id,file:'docs/api.md',title:'Forbidden',reason:'Reference',source:'Test',content:'# New',category:'testing',operationId:'reference-test',baseHash:hash('# API\nPublic contract')}),/约束入口或模块/);
  assert.throws(()=>f.store.configure(f.project.id,{referenceFiles:Array(51).fill('docs/api.md')}),/列表格式/);
  assert.throws(()=>f.store.configure(f.project.id,{referenceFiles:['../outside.md']}),/允许范围/);
  assert.throws(()=>f.store.configure(f.project.id,{referenceFiles:['AGENTS.md']}),/重叠/);
  assert.throws(()=>f.store.configure(f.project.id,{referenceFiles:['.agent-workbench/rules/api.md']}),/重叠/);
  const link=path.join(f.projectRoot,'docs/link.md'); fs.symlinkSync(path.join(f.projectRoot,'docs/api.md'),link);
  assert.throws(()=>f.store.configure(f.project.id,{referenceFiles:['docs/link.md']}),/符号链接/);
  const reopened=new Workbench(f.data); assert.equal(reopened.document(f.project.id,'docs/decisions.md').exists,true);
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
  const f = fixture(t,{afterWrite:() => f.write('docs/maintenance','blocking file')}); const p = f.proposal();
  assert.throws(() => f.store.apply(p.id,p));
  assert.equal(f.store.document(f.project.id,'AGENTS.md').content,p.content);
  fs.unlinkSync(path.join(f.projectRoot,'docs/maintenance')); const restarted = new Workbench(f.data); restarted.recover();
  assert.equal(restarted.proposal(p.id).status,'applied'); assert.equal(restarted.journal(f.project.id).length,1);
});
test('path escapes, ordinary symlinks and dangling symlinks are rejected',t => {
  const f = fixture(t); const outside = path.join(f.root,'outside.md'); fs.writeFileSync(outside,'private');
  fs.mkdirSync(path.join(f.projectRoot,'.agent-workbench/rules'),{recursive:true});
  fs.symlinkSync(outside,path.join(f.projectRoot,'.agent-workbench/rules/link.md'));
  fs.symlinkSync(path.join(f.root,'absent'),path.join(f.projectRoot,'.agent-workbench/rules/dangling.md'));
  for (const file of ['../outside.md','.agent-workbench/rules/link.md','.agent-workbench/rules/dangling.md']) assert.throws(() => f.proposal({file}));
});
test('superseded module documents are not returned as effective context',t => {
  const f = fixture(t); f.write('AGENTS.md','# Root');
  f.write('.agent-workbench/rules/old.md','---\nstatus: superseded\nsuperseded_by: .agent-workbench/rules/new.md\n---\n# Old'); f.write('.agent-workbench/rules/new.md','# New');
  assert.deepEqual(f.store.context(f.project.id).modules.map(d => d.file),['.agent-workbench/rules/new.md']);
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
  f.store.record(f.project.id,{title:'Record',category:'testing',background:'Why',result:'Done',journalFile:rule});
  assert.equal(fs.readFileSync(rule,'utf8'),'Original rule');
  const global = path.join(f.root,'global.md'); fs.writeFileSync(global,'Original global'); f.store.setGlobal(global);
  f.store.record('global',{title:'Record',category:'testing',background:'Why',result:'Done',journalFile:global});
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


test('standard directories are chosen without creating files; unrelated docs are not read as context',t => {
  const f = fixture(t);
  assert.deepEqual(f.project.ruleFiles,['AGENTS.md']);
  assert.deepEqual(f.project.ruleRoots,['.agent-workbench/rules']);
  assert.equal(f.project.journalDir,'docs/maintenance');
  assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
  f.write('AGENTS.md','# Entry'); f.write('.agent-workbench/rules/frontend.md','# Frontend\nLazy body');
  f.write('.agent-workbench/rules/index.md','# Routes\n\nFrontend work: [Frontend](frontend.md)');
  f.write('.trellis/spec/old.md','# Legacy tree is not implicit');
  f.write('docs/random.md','# Not a rule'); f.write('README.md','# Not context');
  f.write('.trellis/research/example.md','# Unconfirmed investigation');
  const context = f.store.context(f.project.id);
  assert.deepEqual(context.rules.map(doc => doc.file),['AGENTS.md']);
  assert.deepEqual(context.indexes.map(doc => doc.file),['.agent-workbench/rules/index.md']);
  assert.ok(context.indexes[0].content.includes('frontend.md'));
  assert.ok(context.modules.every(doc => doc.content === undefined));
  assert.ok(!JSON.stringify(context).includes('Lazy body'));
  assert.deepEqual(f.store.catalog(f.project.id).docs.map(doc => doc.file),['.agent-workbench/rules/index.md','AGENTS.md','.agent-workbench/rules/frontend.md'].sort((a,b) => (a.endsWith('/index.md') ? -1 : b.endsWith('/index.md') ? 1 : a.localeCompare(b))));
  assert.throws(() => f.store.document(f.project.id,'docs/random.md'),/没有发现/);
});
test('stored custom paths and old Trellis sources do not redirect standard reads or writes',t => {
  const f = fixture(t);
  Object.assign(f.store.registry.projects[0],{ruleFiles:['instructions.md'],ruleRoots:['docs/agent'],journalDir:'old-logs'});
  f.store.saveRegistry();
  f.write('instructions.md','# Old entry'); f.write('docs/agent/frontend.md','# Old rule');
  f.write('old-logs/2026-11.md','# Old log\n\n## Old event');
  f.write('.trellis/workspace/journal.md','# Trellis log\n\n## Old event');
  f.write('.trellis/spec/index.md','# Old rules');
  f.write('AGENTS.md','# Entry'); f.write('.agent-workbench/rules/frontend.md','# Current rule');
  const registryBefore=fs.readFileSync(f.store.registryFile,'utf8');
  const restarted = new Workbench(f.data);
  assert.deepEqual(restarted.context(f.project.id).modules.map(doc=>doc.file),['.agent-workbench/rules/frontend.md']);
  assert.deepEqual(restarted.journal(f.project.id),[]);
  for(const file of ['instructions.md','docs/agent/frontend.md','old-logs/2026-11.md','.trellis/workspace/journal.md']) {
    assert.throws(()=>restarted.document(f.project.id,file),/没有发现/);
    assert.throws(()=>restarted.target(restarted.project(f.project.id),file),/约束入口或模块/);
  }
  const empty=new Workbench(path.join(f.root,'empty-state'));
  assert.deepEqual(empty.inspect({root:f.projectRoot}).discovered,['AGENTS.md','.agent-workbench/rules']);
  assert.equal(fs.readFileSync(f.store.registryFile,'utf8'),registryBefore,'reading does not migrate files');
  restarted.configure(f.project.id,{name:'Renamed'});
  const stored=JSON.parse(fs.readFileSync(f.store.registryFile,'utf8')).projects[0];
  for(const key of ['ruleFiles','ruleRoots','journalDir'])assert.equal(stored[key],undefined);
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'instructions.md'),'utf8'),'# Old entry');
});
