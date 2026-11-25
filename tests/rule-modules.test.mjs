import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Workbench } from '../src/store.mjs';
import { fixture } from './helpers.mjs';
const input=f=>({projectId:f.project.id,baseHash:f.store.constraintSet(f.project.id).baseHash,files:[{file:'AGENTS.md',content:'# 项目约束\n'},{file:'.agent-workbench/rules/index.md',content:'# 约束索引\n'},{file:'.agent-workbench/rules/frontend/ui.md',content:'# 界面\n\n- 保留键盘焦点。\n'}]});
const save=(f,data,operationId='save-set')=>{const preview=f.store.previewConstraintSet(data);return f.store.saveConstraintSet({...data,reviewHash:preview.contentHash,operationId});};
test('whole-tree preview is read only; one exact save writes all files and one journal',t=>{
  const f=fixture(t);const data=input(f);const plan=f.store.previewConstraintSet(data);
  assert.deepEqual(fs.readdirSync(f.projectRoot),[]);assert.equal(f.store.proposals().length,0);
  assert.throws(()=>f.store.saveConstraintSet({...data,reviewHash:'stale',operationId:'bad'}),/差异已变化/);
  const request={...data,reviewHash:plan.contentHash,operationId:'one'};
  const p=f.store.saveConstraintSet(request);assert.equal(p.status,'applied');assert.equal(f.store.saveConstraintSet(request).id,p.id);
  assert.equal(f.store.journal(f.project.id).length,1);assert.equal(f.store.context(f.project.id).modules.length,2);
  const snapshot=f.store.constraintSet(f.project.id);assert.ok(!Object.hasOwn(snapshot,'directories'));assert.ok(snapshot.files.every(file=>!Object.hasOwn(file,'purpose')));
  assert.ok(!snapshot.files.find(i=>i.file.endsWith('index.md')).content.includes('awb:structure'));
  assert.throws(()=>f.store.previewConstraintSet({...snapshot,projectId:f.project.id}),/没有变化/);
});
test('whole templates persist file paths and bodies as independent copies',t=>{
  const f=fixture(t);const data=input(f);const saved=f.store.saveTemplate({...data,name:'我的项目约束',description:'团队模板'});
  assert.equal(saved.files.length,3);assert.ok(!Object.hasOwn(saved,'directories'));assert.ok(saved.files.every(file=>!Object.hasOwn(file,'purpose')));
  const reopened=new Workbench(f.data);assert.equal(reopened.templates().find(i=>i.id===saved.id).files[2].content,data.files[2].content);
  assert.equal(reopened.templates().filter(i=>i.builtin).length,1);assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
  assert.throws(()=>f.store.saveTemplate({...data,name:saved.name}),/名称已存在/);
});

test('project templates preserve maintenance history and cannot copy logs or Skill files',t=>{
  const f=fixture(t);const month='docs/maintenance/'+new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7)+'.md';
  const history='# 项目维护日志\n\n## 2026-11-01 · 原有记录\n\n- **结果**：HISTORY_STAYS_WITH_PROJECT\n';f.write(month,history);
  const template=f.store.templates().find(item=>item.id==='default');
  const request={...template,projectId:f.project.id,baseHash:f.store.constraintSet(f.project.id).baseHash};
  f.store.previewConstraintSet(request);assert.equal(fs.readFileSync(path.join(f.projectRoot,month),'utf8'),history);
  save(f,request,'apply-project-template');
  assert.ok(fs.readFileSync(path.join(f.projectRoot,month),'utf8').startsWith(history));assert.equal(f.store.journal(f.project.id).length,2);
  const context=f.store.context(f.project.id);assert.ok(!JSON.stringify(context).includes('HISTORY_STAYS_WITH_PROJECT'));
  for(const doc of template.files.filter(item=>!['AGENTS.md','.agent-workbench/rules/index.md'].includes(item.file)))assert.ok(context.indexes[0].content.includes(doc.file.split('/').pop()));
  const snapshot=f.store.constraintSet(f.project.id);const personal=f.store.saveTemplate({...snapshot,name:'Project only'});
  assert.equal(personal.files.length,8);assert.ok(!JSON.stringify(personal).includes('HISTORY_STAYS_WITH_PROJECT'));
  for(const file of [month,'skills/agent-workbench/SKILL.md'])assert.throws(()=>f.store.saveTemplate({...snapshot,name:'Invalid '+file,files:[...snapshot.files,{file,content:'# Not a project constraint'}]}),/约束只保存在/);
});
test('whole save supports add, rename and deletion with exact history',t=>{
  const f=fixture(t);save(f,input(f));const snapshot=f.store.constraintSet(f.project.id);
  const data={...snapshot,projectId:f.project.id,files:snapshot.files.map(i=>i.file.endsWith('ui.md') ? {...i,file:'.agent-workbench/rules/frontend/interaction.md',content:'# 新界面'} : i)};
  const p=save(f,data,'rename');assert.ok(p.files.some(i=>i.file.endsWith('ui.md') && i.content===null));
  assert.equal(fs.existsSync(path.join(f.projectRoot,'.agent-workbench/rules/frontend/ui.md')),false);
  assert.equal(f.store.document(f.project.id,'.agent-workbench/rules/frontend/interaction.md').content,'# 新界面');
  assert.equal(f.store.journal(f.project.id).length,2);
});
test('external changes to any file or an added file stop an old whole-tree save',t=>{
  const f=fixture(t);save(f,input(f));const snapshot=f.store.constraintSet(f.project.id);const data={...snapshot,projectId:f.project.id};data.files[0].content+='\nNew';const plan=f.store.previewConstraintSet(data);
  f.write('.agent-workbench/rules/extra.md','# External');
  assert.throws(()=>f.store.saveConstraintSet({...data,reviewHash:plan.contentHash,operationId:'conflict'}),/已被外部修改/);
  assert.equal(f.store.document(f.project.id,'.agent-workbench/rules/extra.md').content,'# External');
});
test('invalid tree paths, collisions, duplicate names and removed entry are rejected',t=>{
  const f=fixture(t);
  for(const file of ['../outside.md','docs/rules.md','.agent-workbench/rules/../bad.md','.agent-workbench/rules/.hidden/a.md']){const data=input(f);data.files[2].file=file;assert.throws(()=>f.store.previewConstraintSet(data));}
  const data=input(f);data.files.push({...data.files[2]});assert.throws(()=>f.store.previewConstraintSet(data),/重复/);
  const collision=input(f);collision.files.push({file:'.agent-workbench/rules/frontend/ui.md/nested.md',content:'# bad'});assert.throws(()=>f.store.previewConstraintSet(collision),/同时用作目录/);
  const missing=input(f);missing.files.shift();assert.throws(()=>f.store.previewConstraintSet(missing),/保留项目入口/);
});
test('interrupted whole-tree save resumes once without duplicate maintenance',t=>{
  let fail=true;const f=fixture(t,{afterWrite(){if(fail){fail=false;throw Error('interrupted');}}});const data=input(f);const plan=f.store.previewConstraintSet(data);const request={...data,reviewHash:plan.contentHash,operationId:'resume'};
  assert.throws(()=>f.store.saveConstraintSet(request),/interrupted/);const reopened=new Workbench(f.data);reopened.recover();assert.equal(reopened.proposals()[0].status,'applied');assert.equal(reopened.journal(f.project.id).length,1);assert.equal(reopened.saveConstraintSet(request).status,'applied');
});
test('recovery preserves external edits after partial writes and exposes snapshots',t=>{
  const f=fixture(t,{afterWrite(){throw Error('interrupted');}});const data=input(f);assert.throws(()=>save(f,data));f.write('.agent-workbench/rules/index.md','# User changes');
  const reopened=new Workbench(f.data);reopened.recover();assert.equal(reopened.proposals()[0].status,'conflict');assert.equal(reopened.recoveryWarnings.length,1);assert.equal(reopened.document(f.project.id,'.agent-workbench/rules/index.md').content,'# User changes');
});
test('whole-tree preview rejects symbolic links without modifying targets',t=>{
  const f=fixture(t);const outside=f.write('outside.md','# Keep');const data=input(f);fs.symlinkSync(outside,path.join(f.projectRoot,'AGENTS.md'));assert.throws(()=>f.store.previewConstraintSet(data));assert.equal(fs.readFileSync(outside,'utf8'),'# Keep');
});

test('retired description metadata is discarded without changing authored index text',t=>{
  const f=fixture(t);const data=input(f);save(f,data);
  const index='.agent-workbench/rules/index.md';const authored='# 约束索引\n\n| 任务 | 文档 |\n| --- | --- |\n| 修改交互 | [UI](frontend/ui.md) |\n';
  const legacy=authored+'\n<!-- awb:structure:start -->\n| `AGENTS.md` | OLD_BOARD_NOTE |\n<!-- awb:structure:end -->\n';f.write(index,legacy);
  const snapshot=f.store.constraintSet(f.project.id);assert.equal(snapshot.files.find(file=>file.file===index).content,authored);
  assert.equal(f.store.document(f.project.id,index).content,legacy); // Reading never migrates disk files.
  save(f,{...snapshot,projectId:f.project.id},'cleanup');assert.equal(f.store.document(f.project.id,index).content,authored);
  const oldTemplate={id:'legacy',name:'Legacy',createdAt:'2026-11-25',directories:[{file:'.agent-workbench/rules/',purpose:'OLD_BOARD_NOTE'}],files:snapshot.files.map(({file,content})=>({file,content:file===index ? legacy : content,purpose:'OLD_BOARD_NOTE'}))};
  fs.mkdirSync(path.join(f.data,'templates'),{recursive:true});fs.writeFileSync(path.join(f.data,'templates/legacy.json'),JSON.stringify(oldTemplate));
  const loaded=f.store.templates().find(item=>item.id==='legacy');assert.ok(!Object.hasOwn(loaded,'directories'));assert.ok(!JSON.stringify(loaded).includes('OLD_BOARD_NOTE'));assert.equal(loaded.files.find(file=>file.file===index).content,authored);
  const saved=f.store.saveTemplate({...oldTemplate,name:'Clean copy'});assert.ok(!JSON.stringify(saved).includes('OLD_BOARD_NOTE'));assert.ok(!Object.hasOwn(saved,'directories'));
});
