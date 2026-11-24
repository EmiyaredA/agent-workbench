import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { Workbench } from '../src/store.mjs';
import { sections, markdownLinks } from '../src/maintenance.mjs';
import { createApp } from '../src/server.mjs';
import { fixture } from './helpers.mjs';
const note = (title,status='implemented',extra='')=>`# Agent Note: ${title}\n\nStatus: ${status}\n\n${extra}\n\n## Problem\n\n跨 Agent 交接。\n\n## Decision\n\n项目 Markdown 保存事实。\n\n## Alternatives considered\n\n数据库增加维护成本。\n\n## Consequences\n\n可迁移，但需处理冲突。\n`;
const file = '.agents/notes/implemented/architecture/2026-10-02-files.md';

test('sections and links parse Markdown structure without reading fenced examples',()=>{
  const raw='## 背景\n\n真实背景\n\n```md\n## Decision\n假的章节 [假链接](fake.md)\n```\n\n## 采用的方案\n\n真实方案 [文档](../rules/a.md#part)\n\n## 曾考虑的备选\n\n保留代价。\n\n[外部](https://example.com) [越界](../../../outside.md)';
  assert.equal(sections(raw).decision,'真实方案 [文档](../rules/a.md#part)');
  assert.equal(sections(raw).alternatives.startsWith('保留代价。'),true);
  assert.deepEqual(markdownLinks(raw,'docs/notes/a.md'),['docs/rules/a.md']);
});
test('four views share exact relations and distinguish dates, archive and replacement',t=>{
  const f=fixture(t); f.write('AGENTS.md',`# Root\n\n[文件方案](${file})`); f.write(file,note('文件方案'));
  f.write('.agents/notes/implemented/process/2026-09-01-old.md',note('旧流程','implemented',`superseded_by: ${file}`));
  f.write('.agents/notes/archived/testing/2026-08-01-sealed.md',note('归档快照','implemented','Archived: 2026-11-24'));
  f.write('.agents/notes/rejected/feature/2026-10-02-files.md',note('同名不同方案','rejected'));
  f.write('docs/maintenance/2026-11.md',`# Journal\n\n## 2026-11-24 · 真正落地\n\n- **结果**：完成文件读取。\n- **验证**：读取测试通过。\n- **后续**：观察规模。\n\n[决定](../../${file}) [缺失](../../.agents/notes/implemented/architecture/missing.md)\n\n## 未标日期的交接\n\n后续检查 2026-11-30。`);
  const data=f.store.maintenance(f.project.id); const selected=data.notes.find(n=>n.file===file);
  assert.equal(selected.date,'2026-10-02'); assert.equal(selected.inbound.length,3); assert.equal(selected.entryKeys.length,1);
  assert.equal(data.entries.find(e=>e.title==='真正落地').date,'2026-11-24');
  assert.equal(data.entries.find(e=>e.title==='未标日期的交接').date,'');
  assert.equal(data.entries.find(e=>e.title==='真正落地').result,'完成文件读取。');
  assert.equal(data.notes.find(n=>n.title==='归档快照').status,'archived');
  assert.equal(data.notes.find(n=>n.title==='旧流程').superseded,true);
  assert.equal(data.notes.find(n=>n.title==='同名不同方案').entryKeys.length,0);
  assert.ok(data.warnings.some(w=>w.message.includes('missing.md')));
  assert.equal(f.store.context(f.project.id).rules.length,1);
});
test('record persists portable links, stable keys and exact idempotency across restart/month files',t=>{
  const f=fixture(t); f.write(file,note('文件方案')); f.write('AGENTS.md','# Root');
  const input={title:'完成读取',background:'交接需要',result:'读取完成',verification:'单测通过',next:'观察',category:'testing',decisionFiles:[file],relatedFiles:['AGENTS.md'],operationId:'read-once'};
  const first=f.store.record(f.project.id,input);
  const text=fs.readFileSync(path.join(f.projectRoot,first.file),'utf8');
  assert.ok(text.includes('[2026-10-02-files.md]')); assert.ok(text.includes('awb-record:'));
  const old='docs/maintenance/2026-01.md'; fs.renameSync(path.join(f.projectRoot,first.file),path.join(f.projectRoot,old));
  const restarted=new Workbench(f.data); const second=restarted.record(f.project.id,input);
  assert.equal(second.replayed,true); assert.equal(second.file,old); assert.equal(restarted.journal(f.project.id).length,1);
  assert.throws(()=>restarted.record(f.project.id,{...input,result:'不同内容'}),error=>error.status===409);
  const data=restarted.maintenance(f.project.id); assert.equal(data.entries[0].category,'testing'); assert.equal(data.notes[0].entryKeys.length,1);
  assert.equal(data.entries[0].verification,'单测通过'); assert.equal(data.entries[0].next,'观察');
  assert.equal(data.entries[0].links.filter(link=>link.file===file).length,1);
});
test('record validates links and remains backward compatible; global history has individual entries',t=>{
  const f=fixture(t); const input={title:'维护',background:'原因',result:'结果'};
  assert.throws(()=>f.store.record(f.project.id,{...input,operationId:'bad -->'}));
  assert.throws(()=>f.store.record(f.project.id,{...input,decisionFiles:['../private.md']}));
  assert.throws(()=>f.store.record(f.project.id,{...input,decisionFiles:['AGENTS.md']}));
  assert.throws(()=>f.store.record(f.project.id,{...input,relatedFiles:['docs/private.md']}));
  assert.throws(()=>f.store.record(f.project.id,{...input,category:'other'}));
  f.store.record(f.project.id,input); f.store.record(f.project.id,input); assert.equal(f.store.journal(f.project.id).length,2);
  const global=path.join(f.root,'global.md');fs.writeFileSync(global,'# Global');f.store.setGlobal(global);
  f.store.record('global',{...input,operationId:'global-one'}); f.store.record('global',{...input,title:'另一条',operationId:'global-two'});
  const data=f.store.maintenance('global');assert.equal(data.entries.length,2);assert.equal(data.notes.length,0);
});
test('maintenance HTTP and CLI query the same read-only facts; writes retain nonce checks',async t=>{
  const f=fixture(t);f.write(file,note('文件方案'));const {server}=createApp({store:f.store});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const url=`/api/projects/${f.project.id}/maintenance`;const json=await fetch(base+url).then(r=>r.json());assert.equal(json.notes[0].title,'文件方案');
  assert.equal((await fetch(base+'/maintenance.js')).status,200);
  assert.equal((await fetch(base+`/api/projects/${f.project.id}/journal`,{method:'POST',body:'{}'})).status,403);
  const output=spawnSync(process.execPath,['skills/agent-workbench/scripts/workbench.mjs','maintenance','--project',f.project.id,'--data',f.data,'--query','文件方案'],{encoding:'utf8'});
  assert.equal(output.status,0,output.stderr);assert.equal(JSON.parse(output.stdout).notes[0].file,file);
  assert.deepEqual(fs.readdirSync(f.data),['projects.json']);
});
test('same operation retried in concurrent CLI processes is recorded once',async t=>{
  const f=fixture(t);const input=path.join(f.root,'record.json');fs.writeFileSync(input,JSON.stringify({title:'一次操作',background:'原因',result:'完成',operationId:'concurrent-operation'}));
  await Promise.all([0,1,2].map(async()=>{const child=spawn(process.execPath,['src/cli.mjs','record','--project',f.project.id,'--data',f.data,'--input',input],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',data=>error+=data);const [code]=await once(child,'exit');assert.equal(code,0,error);}));
  assert.equal(f.store.journal(f.project.id).length,1);
});

test('archive marks and invalid replacement targets remain explicit without guessing',t=>{
  const f=fixture(t);f.write(file,note('原始方案','implemented','superseded_by: ../outside.md'));
  f.write('.agents/notes/implemented/process/2026-10-01-marked.md',note('归档标记','implemented','Archived: 2026-11-24'));
  f.write('.agents/notes/implemented/process/2026-10-02-code.md',note('代码示例','implemented',`\`\`\`yaml\nsuperseded_by: ${file}\n\`\`\``));
  const data=f.store.maintenance(f.project.id);
  assert.equal(data.notes.find(n=>n.title==='归档标记').status,'archived');
  assert.equal(data.notes.find(n=>n.title==='原始方案').superseded,false);
  assert.equal(data.notes.find(n=>n.title==='代码示例').superseded,false);
  assert.ok(data.warnings.some(w=>w.message.includes('../outside.md')));
});
