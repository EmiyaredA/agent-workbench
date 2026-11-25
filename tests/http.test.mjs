import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { fixture } from './helpers.mjs';

async function service(t) {
  const f = fixture(t); const {server} = createApp({store:f.store});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = await fetch(base+'/api/session').then(r => r.json());
  const request = (url,body,method = 'POST',extra = {}) => fetch(base+url,{method,headers:{'Content-Type':'application/json',Origin:base,'X-Workbench-Nonce':session.nonce,...extra},body:JSON.stringify(body)});
  return {...f,base,request};
}
test('serves UI and all local runtime assets without external resources',async t => {
  const f = await service(t);
  for (const route of ['/','/app.js','/style.css','/theme.css','/vendor/marked.js','/vendor/purify.js','/icons/style.css','/icons/Phosphor.woff2']) assert.equal((await fetch(f.base+route)).status,200,route);
  for (const route of ['/assets/kurisu-avatar.png','/assets/kurisu-favicon-32.png','/assets/kurisu-icon-192.png','/assets/kurisu-apple-touch-icon.png']) {
    const asset=await fetch(f.base+route);
    assert.equal(asset.status,200,route);assert.equal(asset.headers.get('content-type'),'image/png');
    assert.equal(Buffer.from(await asset.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
  const favicon=await fetch(f.base+'/favicon.ico');assert.equal(favicon.status,200);assert.equal(favicon.headers.get('content-type'),'image/x-icon');
  const skill = await fetch(f.base+'/api/skill').then(r => r.json());
  assert.equal(skill.content,fs.readFileSync(new URL('../skills/agent-workbench/SKILL.md',import.meta.url),'utf8'));
  assert.equal(skill.file,'skills/agent-workbench/SKILL.md');
  const reference=await fetch(f.base+'/api/skill?file=skills%2Fagent-workbench%2Freferences%2Fdecision-notes.md').then(r=>r.json());
  assert.equal(reference.content,fs.readFileSync(new URL('../skills/agent-workbench/references/decision-notes.md',import.meta.url),'utf8'));
  for(const file of ['references/maintenance-records.md','assets/maintenance/record.xml','assets/constraints/change.xml','assets/constraints/propose.xml']){
    const relative='skills/agent-workbench/'+file;
    const resource=await fetch(f.base+'/api/skill?file='+encodeURIComponent(relative)).then(r=>r.json());
    assert.equal(resource.content,fs.readFileSync(relative,'utf8'));assert.equal(resource.file,relative);
  }
  for (const file of ['../../AGENTS.md','/etc/passwd','README.md','skills/agent-workbench/scripts/workbench.mjs','skills/agent-workbench/references/note-sources.md','docs/research/note-sources.md']) assert.equal((await fetch(f.base+'/api/skill?file='+encodeURIComponent(file))).status,404);
  assert.equal((await fetch(f.base+'/unknown')).status,404);
});
test('mutations require same-origin UI nonce and invalid JSON is rejected',async t => {
  const f = await service(t); const route = `/api/projects/${f.project.id}/journal`;
  assert.equal((await f.request(route,{},'POST',{Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await f.request(route,{},'POST',{'X-Workbench-Nonce':'wrong'})).status,403);
  assert.equal((await f.request(route,[])).status,400);
});
test('project registration and settings reject custom source directories',async t => {
  const f = await service(t);
  for (const [key,value] of Object.entries({ruleFiles:['old.md'],ruleRoots:['docs/agent'],journalDir:'logs'})) {
    for (const response of [await f.request('/api/projects',{root:f.projectRoot,[key]:value}),await f.request(`/api/projects/${f.project.id}`,{[key]:value},'PATCH')]) {
      assert.equal(response.status,400);
      assert.match((await response.json()).error,/不支持的项目设置/);
    }
  }
  assert.equal((await f.request(`/api/projects/${f.project.id}`,{name:'Renamed',referenceFiles:[]},'PATCH')).status,200);
  const catalog=await fetch(f.base+`/api/projects/${f.project.id}`).then(r=>r.json());
  assert.equal(catalog.project.name,'Renamed');assert.equal(catalog.project.journalDir,'docs/maintenance');
});
test('direct changes require the UI nonce and expose history without duplicating snapshot bodies in state',async t=>{
  const f=await service(t); f.write('AGENTS.md','# Before');
  const payload={projectId:f.project.id,file:'AGENTS.md',title:'Direct iteration',reason:'User task',category:'process',source:'User',baseHash:f.store.document(f.project.id,'AGENTS.md').hash,content:'# After',operationId:'http-direct'};
  assert.equal((await f.request('/api/changes',{...payload,category:''})).status,400);
  assert.equal((await fetch(f.base+'/api/changes',{method:'POST',body:JSON.stringify(payload)})).status,403);
  const response=await f.request('/api/changes',payload); assert.equal(response.status,201);
  const change=await response.json(); assert.equal(change.status,'recorded');
  const state=await fetch(f.base+'/api/state').then(r=>r.json());
  assert.equal(state.proposals[0].request,undefined); assert.equal(state.proposals[0].content,undefined);
  const detail=await fetch(f.base+'/api/proposals/'+change.id).then(r=>r.json()); assert.equal(detail.baseContent,'# Before'); assert.equal(detail.content,'# After');
  assert.equal((await f.request('/api/changes/'+change.id+'/retry',{})).status,200); assert.equal(f.store.journal(f.project.id).length,1);
});
test('HTTP approval requires exact versions and returns applied state',async t => {
  const f = await service(t); const proposalResponse = await f.request('/api/proposals',{projectId:f.project.id,file:'AGENTS.md',title:'HTTP proposal',reason:'Test',category:'process',source:'Fixture',content:'# New rule'});
  assert.equal(proposalResponse.status,201); const p = await proposalResponse.json();
  assert.equal((await f.request(`/api/proposals/${p.id}/apply`,{baseHash:p.baseHash,contentHash:'wrong'})).status,409);
  assert.equal((await f.request(`/api/proposals/${p.id}/apply`,p)).status,200);
  assert.equal(f.store.proposal(p.id).status,'applied'); assert.equal(f.store.journal(f.project.id).length,1);
});
test('GET requests do not recover or write interrupted transactions',async t => {
  const f = await service(t); f.store.hooks.afterWrite = () => {throw Error('crash');}; const p = f.proposal();
  assert.throws(() => f.store.apply(p.id,p));
  assert.equal((await fetch(f.base+'/api/state')).status,200);
  assert.equal(f.store.proposal(p.id).status,'pending'); assert.equal(f.store.journal(f.project.id).length,0);
});

test('whole constraint set APIs preview read-only and save the exact reviewed tree',async t=>{
  const f=await service(t); assert.equal((await fetch(f.base+'/rule-modules.js')).status,200);
  const templates=await fetch(f.base+'/api/templates').then(r=>r.json());assert.equal(templates.length,2);
  const snapshot=await fetch(f.base+`/api/projects/${f.project.id}/constraints`).then(r=>r.json());
  const input={...templates[0],projectId:f.project.id,baseHash:snapshot.baseHash};
  assert.equal((await f.request('/api/templates',{...input,name:'Personal'})).status,201);
  assert.equal((await f.request('/api/constraints/preview',input,'POST',{'X-Workbench-Nonce':'bad'})).status,403);
  const preview=await f.request('/api/constraints/preview',input).then(r=>r.json());assert.equal(preview.fileChanges.length,2);assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
  const response=await f.request('/api/constraints',{...input,reviewHash:preview.contentHash,operationId:'http-set'});assert.equal(response.status,201);
  const p=await response.json();assert.equal(p.status,'applied');
  const state=await fetch(f.base+'/api/state').then(r=>r.json());assert.equal(state.proposals[0].files,undefined);assert.equal(state.proposals[0].affectedFiles.length,2);
  const detail=await fetch(f.base+'/api/proposals/'+p.id).then(r=>r.json());assert.equal(detail.fileChanges.length,2);
});
