import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Workbench } from '../src/store.mjs';
import { seedDemo } from '../src/demo.mjs';
import { fixture } from './helpers.mjs';

test('rich demo has distinct documents, review outcomes, history and repeatable initialization',t => {
  const f = fixture(t); const store = new Workbench(path.join(f.root,'isolated-demo'));
  seedDemo(store);
  assert.equal(store.registry.projects.length,3);
  for (const project of store.registry.projects) {
    assert.equal(project.demo,true);
    assert.ok(project.root.startsWith(store.dataDir+path.sep));
    const docs = store.catalog(project.id).docs;
    assert.ok(docs.filter(d => d.role === 'rule').length >= 7);
    assert.ok(new Set(docs.filter(d => d.role === 'decision').map(d => d.status)).size >= 4);
    assert.ok(store.journal(project.id).length >= 6);
    assert.ok(new Set(store.journal(project.id).map(d => d.date.slice(0,7))).size >= 3);
  }
  const proposals = store.proposals();
  assert.ok(proposals.length >= 10);
  for (const status of ['pending','applied','rejected','conflict']) assert.ok(proposals.some(p => p.status === status));
  for (const p of proposals.filter(p => ['pending','rejected'].includes(p.status))) assert.equal(store.document(p.projectId,p.file).content,p.baseContent);
  for (const p of proposals.filter(p => p.status === 'applied')) assert.equal(store.document(p.projectId,p.file).content,p.content);
  const conflict = store.diff(proposals.find(p => p.status === 'conflict').id);
  assert.notEqual(conflict.currentContent,conflict.baseContent);
  assert.equal(store.registry.projects.some(p => p.root === f.projectRoot),false);
  const file = path.join(store.registry.projects[0].root,'AGENTS.md');
  fs.appendFileSync(file,'\n示例使用者的新编辑。\n'); const content = fs.readFileSync(file,'utf8');
  seedDemo(store);
  assert.equal(fs.readFileSync(file,'utf8'),content);
  assert.equal(store.proposals().length,proposals.length);
});

test('demo refuses a workspace with registered real projects without changing files',t => {
  const f = fixture(t); const registry = fs.readFileSync(f.store.registryFile,'utf8');
  assert.throws(() => seedDemo(f.store),/隔离的空工作区/);
  assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
  assert.equal(fs.readFileSync(f.store.registryFile,'utf8'),registry);
  assert.equal(fs.existsSync(path.join(f.data,'demo-projects')),false);
});
