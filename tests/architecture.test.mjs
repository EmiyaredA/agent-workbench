import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { Workbench } from '../src/store.mjs';
import { Architecture, architectureXML, parseArchitectureXML } from '../src/architecture.mjs';
import { createApp } from '../src/server.mjs';

function fixture(t) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'awb-architecture-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'project');fs.mkdirSync(path.join(project,'src'),{recursive:true});
  fs.writeFileSync(path.join(project,'AGENTS.md'),'# Project\n');
  fs.writeFileSync(path.join(project,'src/api.js'),'export function accept(input) {\n  return input;\n}\nexport const version = 1;\n');
  const store=new Workbench(path.join(root,'state'));const registered=store.register({root:project,name:'工坊'});
  const service=new Architecture(store),id=registered.id;
  const snippet={file:'src/api.js',start:1,end:3};
  const item=(id,title)=>({id,title,description:'简短说明',document:'## 职责\n\n读取输入。',snippets:[snippet,{...snippet,start:4,end:4}]});
  const model={title:'工坊架构',description:'组件与数据流',rootGraphId:'overview',graphs:[{id:'overview',title:'组件总览',kind:'component',direction:'DOWN',nodes:[{...item('api','请求入口'),childGraphId:'child'},{...item('store','持久化')}],edges:[{...item('submit','提交任务'),from:'api',to:'store',evidence:'traced',annotations:[item('payload','传递内容')]}]},{id:'child',title:'入口子图',kind:'flow',direction:'RIGHT',nodes:[item('validate','参数校验')],edges:[]}]};
  return {root,project,store,service,id,model,xml:architectureXML(model)};
}

test('architecture reads are side effect free and global scope is excluded',t=>{
  const {service,id,project}=fixture(t);
  assert.equal(service.read(id).model,null);assert.deepEqual(service.list(id).versions,[]);
  assert.equal(fs.existsSync(path.join(project,'.agent-workbench')),false);
  assert.throws(()=>service.read('global'),/架构仅用于项目/);
});
test('XML CDATA round trip preserves Markdown/code punctuation',t=>{
  const {model}=fixture(t);model.graphs[0].nodes[0].document='# A & B\n\n<code> ]]> 中文';
  const result=parseArchitectureXML(architectureXML(model));
  assert.equal(result.graphs[0].nodes[0].document,model.graphs[0].nodes[0].document);
  assert.equal(result.graphs[0].nodes[0].snippets.length,2);
});
test('XML rejects DTD, malformed markup, invalid roots and oversized input',()=>{
  for(const xml of ['<!DOCTYPE architecture><architecture/>','<architecture><bad></architecture>','<record/>','x'.repeat(12_000_001)]) assert.throws(()=>parseArchitectureXML(xml));
});
test('import saves immutable candidates, source snapshots and laid out child graphs',async t=>{
  const {service,id,xml,project,store}=fixture(t);const version=await service.import(id,xml);
  assert.equal(service.list(id).current,'');
  const {model}=service.read(id,version.id);assert.equal(model.graphs.length,2);
  assert.ok(model.graphs[0].layout.nodes[0].width>0);
  assert.equal(model.graphs[0].nodes[0].snippets[1].code,'export const version = 1;');
  fs.writeFileSync(path.join(project,'src/api.js'),'// source changed\n');
  assert.deepEqual(service.status(id,version.id).changed,['src/api.js']);
  assert.match(service.read(id,version.id).model.graphs[0].nodes[0].snippets[0].code,/export function/);
  assert.ok(!store.context(id).modules?.some(m=>JSON.stringify(m).includes('architecture/versions')));
  assert.ok(!store.catalog(id).docs.some(d=>d.file.startsWith('.agent-workbench/architecture/')));
});
test('each node/edge/annotation needs a document and an independent real snippet',async t=>{
  const {service,id,model}=fixture(t);
  for (const mutation of [m=>m.graphs[0].nodes[0].document='',m=>m.graphs[0].edges[0].snippets=[],m=>m.graphs[0].edges[0].annotations[0].snippets[0].end=2000]) {
    const broken=structuredClone(model);mutation(broken);await assert.rejects(service.prepare(id,architectureXML(broken)));
  }
});
test('invalid graph endpoints, duplicate IDs and recursive subgraphs are rejected',async t=>{
  const {service,id,model}=fixture(t);
  for (const mutation of [m=>m.graphs[0].edges[0].to='missing',m=>m.graphs[0].nodes[1].id='api',m=>m.graphs[1].nodes[0].childGraphId='overview',m=>m.graphs[0].nodes[0].childGraphId='missing']) {
    const broken=structuredClone(model);mutation(broken);await assert.rejects(service.prepare(id,architectureXML(broken)));
  }
});
test('source references reject traversal, absolute paths and symlink escapes',async t=>{
  const {service,id,model,project,root}=fixture(t);
  fs.writeFileSync(path.join(root,'outside.js'),'secret');fs.symlinkSync(path.join(root,'outside.js'),path.join(project,'src/link.js'));
  for(const file of ['../outside.js',path.join(root,'outside.js'),'src/link.js','.git/config','.runtime/private.json']) {
    const broken=structuredClone(model);broken.graphs[0].nodes[0].snippets[0].file=file;await assert.rejects(service.prepare(id,architectureXML(broken)));
  }
  assert.throws(()=>service.liveSource(id,'missing','AGENTS.md'));
});
test('adoption records once, binds the current pointer and protects concurrent switches',async t=>{
  const {service,id,xml,store}=fixture(t);const first=await service.import(id,xml),second=await service.import(id,xml);
  const adopted=service.adopt(id,{versionId:first.id});assert.equal(adopted.versionId,first.id);
  service.adopt(id,{versionId:first.id});assert.equal(store.journal(id).filter(e=>e.title.includes('采用架构版本')).length,1);
  assert.throws(()=>service.adopt(id,{versionId:second.id}),/当前版本已变化/);
  service.adopt(id,{versionId:second.id,expectedCurrent:first.id});
  assert.equal(service.list(id).current,second.id);assert.equal(service.list(id).versions.length,2);
});
test('generation requests stay pending until an imported version matches requestId',async t=>{
  const {service,id,model}=fixture(t);const request=service.request(id,{focus:'数据流'});
  assert.equal(service.list(id).requests[0].status,'pending');
  model.requestId=request.id;const version=await service.import(id,architectureXML(model));
  assert.equal(service.list(id).requests[0].versionId,version.id);assert.equal(service.list(id).requests[0].status,'generated');
});
test('semantic version comparison detects docs, nodes and snippets without layout noise',async t=>{
  const {service,id,model,xml}=fixture(t);const first=await service.import(id,xml);
  model.graphs[0].nodes[0].document='新版文档';const second=await service.import(id,architectureXML(model));
  assert.deepEqual(service.compare(id,first.id,second.id).changes.map(c=>[c.kind,c.type]),[['节点','changed']]);
});
test('HTTP protects mutations, validates imports, serves new assets and limits source reads',async t=>{
  const {store,id,root,xml}=fixture(t);const {server}=createApp({store,dataDir:path.join(root,'state')});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const session=await (await fetch(base+'/api/session')).json();const url=base+`/api/projects/${id}/architecture`;
  assert.equal((await fetch(url+'/import',{method:'POST',body:JSON.stringify({xml})})).status,403);
  const response=await fetch(url+'/import',{method:'POST',headers:{Origin:base,'X-Workbench-Nonce':session.nonce,'Content-Type':'application/json'},body:JSON.stringify({xml})});
  assert.equal(response.status,201);const version=await response.json();
  assert.equal((await fetch(url+`/source?version=${version.id}&file=AGENTS.md`)).status,404);
  assert.equal((await fetch(url+`/source?version=${version.id}&file=src/api.js`)).status,200);
  for(const file of ['/architecture.js','/architecture.css'])assert.equal((await fetch(base+file)).status,200);
  assert.equal((await fetch(base+'/api/projects/global/architecture')).status,404);
});
