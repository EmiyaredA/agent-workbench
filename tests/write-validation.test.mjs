import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/server.mjs';
import { once } from 'node:events';
import { hash } from '../src/store.mjs';
import { fixture } from './helpers.mjs';

const input={title:'真实修改',category:'testing',background:'需要验证写入',result:'完成修改',operationId:'validated-record'};
const noteFile='.agents/notes/implemented/testing/2026-11-25-check.md';
const note='# Agent Note: 验证\n\nStatus: implemented\n\n## Problem\n\n验证写入。\n\n## Decision\n\n校验记录结构。\n\n## Alternatives considered\n\n直接写入，但难以确认结果。\n\n## Consequences\n\n结构稳定，仍需核对事实。\n';
const month=f=>path.relative(f.projectRoot,f.store.journalPath(f.project)).split(path.sep).join('/');

test('validated record retains multiline Markdown, code examples and metadata in board parsing',t=>{
  const f=fixture(t);const result='完成中文修改。\r\n\r\n- 第一项\r\n- 第二项\r\n\r\n```md\r\n## 代码里的标题\r\n<!-- awb:example -->\r\n```';
  const saved=f.store.record(f.project.id,{...input,result,verification:'命令：`npm test`\n结果：通过',alternatives:'保持旧实现',tradeoffs:'增加检查成本'});
  const entry=f.store.maintenance(f.project.id).entries[0];assert.equal(entry.key,saved.key);assert.equal(entry.title,input.title);
  assert.equal(entry.result,result.replaceAll('\r\n','\n'));assert.equal(entry.verification,'命令：`npm test`\n结果：通过');
  assert.equal(entry.alternatives,'保持旧实现');assert.equal(entry.tradeoffs,'增加检查成本');assert.equal(entry.category,input.category);
  assert.equal(f.store.record(f.project.id,{...input,result,verification:'命令：`npm test`\n结果：通过',alternatives:'保持旧实现',tradeoffs:'增加检查成本'}).replayed,true);
});

test('invalid titles and forged record metadata fail before any journal write',t=>{
  const f=fixture(t);
  for(const title of ['多行\n标题','x'.repeat(501),'标题 <!-- awb:forged -->','标题 <!-- awb-record:{"version":1,"category":"feature"} -->']){
    assert.throws(()=>f.store.record(f.project.id,{...input,title}),error=>error.status===400);
    assert.deepEqual(fs.readdirSync(f.projectRoot),[]);assert.equal(f.store.proposals().length,0);
  }
});

test('an unclosed legacy log blocks record, direct and whole-set writes without changing source files',t=>{
  const f=fixture(t);const original='# Original\n';f.write('AGENTS.md',original);
  const log=month(f);const broken='# 旧日志\n\n```md\n未闭合示例\n';f.write(log,broken);
  assert.throws(()=>f.store.record(f.project.id,input),/无法独立解析/);
  const change={projectId:f.project.id,file:'AGENTS.md',title:'修改',category:'testing',reason:'验证',source:'User',content:'# Changed',baseHash:hash(original),operationId:'direct'};
  assert.throws(()=>f.store.writeChange(change),/无法独立解析/);
  const template=f.store.templates()[0];const data={...template,projectId:f.project.id,baseHash:f.store.constraintSet(f.project.id).baseHash};
  assert.throws(()=>f.store.previewConstraintSet(data),/无法独立解析/);
  assert.equal(f.store.proposals().length,0);assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),original);assert.equal(fs.readFileSync(path.join(f.projectRoot,log),'utf8'),broken);
});

test('approval rechecks current log structure before starting any rule write or receipt',t=>{
  const f=fixture(t);f.write('AGENTS.md','# Original');const proposal=f.proposal();
  const log=month(f);const broken='# 旧日志\n\n<!-- 未闭合注释\n';f.write(log,broken);
  assert.throws(()=>f.store.apply(proposal.id,{baseHash:proposal.baseHash,contentHash:proposal.contentHash}),/无法独立解析/);
  assert.equal(f.store.document(f.project.id,'AGENTS.md').content,'# Original');assert.equal(fs.existsSync(path.join(f.data,'receipts')),false);assert.equal(f.store.proposal(proposal.id).status,'pending');
  assert.equal(fs.readFileSync(path.join(f.projectRoot,log),'utf8'),broken);
});

test('record checks only associated decision format and live links, leaving unrelated notes alone',t=>{
  const f=fixture(t);f.write(noteFile,note.replace('Status: implemented','Status: proposed'));
  for(const association of [{decisionFiles:[noteFile]},{relatedFiles:[noteFile]},{topic:noteFile},{result:`[决定](../../${noteFile})`}])assert.throws(()=>f.store.record(f.project.id,{...input,...association}),/关联决策未通过校验/);assert.equal(f.store.journal(f.project.id).length,0);
  f.write(noteFile,note+'\n[缺失](missing.md)\n');assert.throws(()=>f.store.record(f.project.id,{...input,decisionFiles:[noteFile]}),/链接目标不存在/);
  f.write('.agents/notes/implemented/process/2026-11-25-unrelated.md','# Invalid legacy note');
  f.write(noteFile,note);f.store.record(f.project.id,{...input,decisionFiles:[noteFile]});assert.equal(f.store.maintenance(f.project.id).notes.find(item=>item.file===noteFile).entryKeys.length,1);
});

test('an associated archived note must have a matching seal before recording a new event',t=>{
  const f=fixture(t);const file=noteFile.replace('/implemented/','/archived/');f.write(file,note.replace('Status: implemented\n','Status: implemented\nArchived: 2026-11-25\n'));
  assert.throws(()=>f.store.record(f.project.id,{...input,decisionFiles:[file]}),/缺少封印/);assert.equal(f.store.journal(f.project.id).length,0);
  f.write('.agents/notes/archived/manifest.json','invalid JSON');assert.throws(()=>f.store.record(f.project.id,{...input,decisionFiles:[file]}),error=>error.status===400);
  const text=fs.readFileSync(path.join(f.projectRoot,file),'utf8');f.write('.agents/notes/archived/manifest.json',JSON.stringify({version:1,files:{[file.slice('.agents/notes/'.length)]:'sha256:'+hash(text)}}));
  f.store.record(f.project.id,{...input,decisionFiles:[file]});assert.equal(f.store.journal(f.project.id).length,1);
  f.write(file,text+'\nChanged');assert.throws(()=>f.store.record(f.project.id,{...input,operationId:'next',decisionFiles:[file]}),/哈希不符/);
  assert.equal(f.store.record(f.project.id,{...input,decisionFiles:[file]}).replayed,true,'completed history remains replayable after later edits');
});

test('HTTP and Skill CLI reject invalid generated records without claiming success',async t=>{
  const f=fixture(t);const {server}=createApp({store:f.store});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;const session=await fetch(base+'/api/session').then(r=>r.json());
  const response=await fetch(base+`/api/projects/${f.project.id}/journal`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Workbench-Nonce':session.nonce},body:JSON.stringify({...input,title:'Fake <!-- awb:forged -->'})});
  assert.equal(response.status,400);assert.match((await response.json()).error,/记录标识|元数据/);
  const file=path.join(f.root,'invalid.json');fs.writeFileSync(file,JSON.stringify({...input,title:'标题\n另一行'}));
  const result=spawnSync(process.execPath,['skills/agent-workbench/scripts/workbench.mjs','record','--project',f.project.id,'--data',f.data,'--input',file],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(JSON.parse(result.stderr).error,/单行文本/);assert.equal(result.stdout,'');assert.equal(f.store.journal(f.project.id).length,0);assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
});

test('maintenance reads flag malformed external notes without mutating them or claiming semantic verification',t=>{
  const f=fixture(t);const invalid=note.replace('## Decision','## Plan');f.write(noteFile,invalid);
  const data=f.store.maintenance(f.project.id);assert.equal(data.notes[0].validation.ok,false);assert.ok(data.notes[0].validation.errors.some(error=>error.includes('decision')));assert.ok(data.warnings.some(warning=>warning.message.includes('计划态')));
  assert.equal(fs.readFileSync(path.join(f.projectRoot,noteFile),'utf8'),invalid);
  f.write(noteFile,note);assert.equal(f.store.maintenance(f.project.id).notes[0].validation.ok,true);
});
