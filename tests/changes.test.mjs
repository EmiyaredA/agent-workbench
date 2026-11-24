import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Workbench, hash } from '../src/store.mjs';
import { fixture } from './helpers.mjs';

const input=(f,overrides={})=>({projectId:f.project.id,file:'AGENTS.md',title:'记录新的任务范围',reason:'保留本次修改来由',source:'本次用户任务授权',category:'process',content:'# Updated\n',baseHash:hash('# Original\n'),operationId:'iteration-one',...overrides});
test('direct iterations preserve exact before/after snapshots and factual history without approval',t=>{
  const f=fixture(t); f.write('AGENTS.md','# Original\n');
  const changed=f.store.writeChange(input(f));
  assert.equal(changed.status,'recorded'); assert.equal(changed.mode,'direct');
  assert.equal(changed.baseContent,'# Original\n'); assert.equal(changed.content,'# Updated\n');
  assert.equal(f.store.diff(changed.id).changes.filter(c=>c.added).map(c=>c.value).join(''),'# Updated\n');
  const logs=f.store.journal(f.project.id); assert.equal(logs.length,1);
  assert.match(logs[0].content,/直接修改并记录/); assert.doesNotMatch(logs[0].content,/审核后写入/);
  assert.equal(f.store.writeChange(input(f)).id,changed.id); assert.equal(f.store.journal(f.project.id).length,1);
  const follow=input(f,{content:'# Followup\n',baseHash:hash('# Updated\n'),operationId:'iteration-two'});
  f.store.writeChange(follow); assert.equal(f.store.proposals().length,2);
  assert.equal(f.store.proposal(changed.id).baseContent,'# Original\n');
  assert.equal(f.store.writeChange(input(f)).id,changed.id);
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),'# Followup\n');
});
test('legacy proposals remain readable but must receive an explicit tag before a new write',t=>{
  const f=fixture(t); f.write('AGENTS.md','# Original\n');
  const p=f.proposal(); delete p.category; f.store.saveProposal(p);
  assert.equal(f.store.diff(p.id).category,undefined);
  assert.throws(()=>f.store.apply(p.id,{baseHash:p.baseHash,contentHash:p.contentHash}),/缺少迭代标签/);
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),'# Original\n');
  f.store.apply(p.id,{baseHash:p.baseHash,contentHash:p.contentHash,category:'process'});
  assert.equal(f.store.maintenance(f.project.id).entries[0].category,'process');
});
test('direct edits stop on stale versions, reused operation IDs and unregistered targets',t=>{
  const f=fixture(t); f.write('AGENTS.md','# Original\n');
  for (const category of [undefined,'','unknown']) assert.throws(()=>f.store.writeChange(input(f,{category})),/迭代标签/);
  assert.equal(f.store.proposals().length,0); assert.equal(f.store.document(f.project.id,'AGENTS.md').content,'# Original\n');
  assert.throws(()=>f.store.writeChange(input(f,{baseHash:null})),/原文已变化/);
  assert.equal(f.store.proposals().length,0);
  f.store.writeChange(input(f));
  assert.equal(f.store.maintenance(f.project.id).entries[0].category,'process');
  assert.throws(()=>f.store.writeChange(input(f,{category:'testing'})),/不同的修改/);
  assert.throws(()=>f.store.writeChange(input(f,{content:'# Other'})),/不同的修改/);
  assert.throws(()=>f.store.writeChange(input(f,{file:'../escape.md',operationId:'escape'})),/允许范围/);
  assert.throws(()=>f.store.writeChange(input(f,{file:'README.md',operationId:'unregistered'})),/已登记的约束/);
});
test('interrupted direct edits recover once and preserve subsequent external edits',t=>{
  const f=fixture(t,{afterWrite:()=>{throw Error('interrupted');}}); f.write('AGENTS.md','# Original\n');
  assert.throws(()=>f.store.writeChange(input(f)),/interrupted/);
  const readOnly=new Workbench(f.data); assert.equal(readOnly.proposals()[0].status,'recording'); assert.equal(readOnly.journal(f.project.id).length,0);
  const recovered=new Workbench(f.data); recovered.recover();
  assert.equal(recovered.proposals()[0].status,'recorded'); assert.equal(recovered.journal(f.project.id).length,1);
  assert.equal(recovered.writeChange(input(f)).status,'recorded'); assert.equal(recovered.journal(f.project.id).length,1);
  const g=fixture(t,{afterWrite:()=>{throw Error('interrupted');}}); g.write('AGENTS.md','# Original\n');
  assert.throws(()=>g.store.writeChange(input(g)),/interrupted/); g.write('AGENTS.md','# User new edit\n');
  const conflict=new Workbench(g.data); conflict.recover();
  assert.equal(conflict.proposals()[0].status,'conflict'); assert.equal(conflict.journal(g.project.id).length,0);
  assert.throws(()=>conflict.writeChange(input(g)),/已中止/);
  assert.equal(fs.readFileSync(path.join(g.projectRoot,'AGENTS.md'),'utf8'),'# User new edit\n');
});
test('global iterations use the same record flow and do not change source mappings',t=>{
  const f=fixture(t); const global=path.join(f.root,'global.md'); fs.writeFileSync(global,'# Original\n'); f.store.setGlobal(global);
  const p=f.store.writeChange(input(f,{projectId:'global',file:'global.md'}));
  assert.equal(p.status,'recorded'); assert.equal(p.scope,'global');
  assert.match(f.store.journal('global')[0].content,/直接修改并记录/);
  assert.equal(f.store.context(f.project.id).rules[0].content,'# Updated\n');
  const other=path.join(f.root,'another.md'); fs.writeFileSync(other,'# Updated\n'); f.store.setGlobal(other);
  assert.equal(f.store.writeChange(input(f,{projectId:'global',file:'global.md'})).id,p.id,'completed replay does not redirect writes');
  assert.equal(fs.readFileSync(other,'utf8'),'# Updated\n');
});
test('Skill CLI performs authorized direct changes from exact read versions',t=>{
  const f=fixture(t); f.write('AGENTS.md','# Original\n'); const file=path.join(f.root,'change.json'); fs.writeFileSync(file,JSON.stringify(input(f)));
  const result=spawnSync(process.execPath,[path.resolve('skills/agent-workbench/scripts/workbench.mjs'),'change','--project',f.project.id,'--data',f.data,'--input',file],{encoding:'utf8',cwd:f.root});
  assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).status,'recorded');
  assert.equal(f.store.journal(f.project.id).length,1);
});
