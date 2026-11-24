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
  for (const route of ['/','/app.js','/style.css','/vendor/marked.js','/vendor/purify.js','/icons/style.css','/icons/Phosphor.woff2']) assert.equal((await fetch(f.base+route)).status,200,route);
  assert.equal((await fetch(f.base+'/unknown')).status,404);
});
test('mutations require same-origin UI nonce and invalid JSON is rejected',async t => {
  const f = await service(t); const route = `/api/projects/${f.project.id}/journal`;
  assert.equal((await f.request(route,{},'POST',{Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await f.request(route,{},'POST',{'X-Workbench-Nonce':'wrong'})).status,403);
  assert.equal((await f.request(route,[])).status,400);
});
test('HTTP approval requires exact versions and returns applied state',async t => {
  const f = await service(t); const proposalResponse = await f.request('/api/proposals',{projectId:f.project.id,file:'AGENTS.md',title:'HTTP proposal',reason:'Test',source:'Fixture',content:'# New rule'});
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
