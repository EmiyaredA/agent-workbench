import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Workbench } from '../src/store.mjs';
import { seedDemo } from '../src/demo.mjs';
import { demoProjects } from '../src/demo-data.mjs';
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


test('decision-centered demo has explicit, topic-specific links and readable comparison sections',t => {
  const f=fixture(t);const store=new Workbench(path.join(f.root,'decision-demo'));seedDemo(store);
  let notes=0;
  for(const project of store.registry.projects) {
    const profile=demoProjects.find(p=>p.name===project.name);const data=store.maintenance(project.id);notes+=data.notes.length;
    assert.deepEqual(data.warnings,[]);
    const noteFor=slug=>data.notes.find(note=>note.file.endsWith('-'+slug+'.md'));
    for(const event of profile.events) {
      const entry=data.entries.find(item=>item.date===event.date && item.title===event.title);
      assert.ok(entry,event.title);assert.ok(entry.verification.includes('示例'));
      assert.deepEqual(entry.links.filter(link=>data.notes.some(note=>note.file===link.file)).map(link=>link.file).sort(),(event.decisions ?? []).map(slug=>noteFor(slug).file).sort());
      for(const slug of event.decisions ?? [])assert.ok(noteFor(slug).date<=entry.date,'iteration must not imply a future decision already existed');
    }
    for(const note of data.notes) {
      assert.ok(note.alternatives.length>0,note.file);
      assert.ok(note.alternatives.every(item=>item.title && item.reason));
      assert.ok(note.links.every(link=>link.exists),note.file);
      if(note.status==='rejected')assert.ok(note.rejectionReason && !note.rejectionReason.includes('undefined'));
    }
  }
  assert.equal(notes,27);
  const work=store.registry.projects.find(p=>p.name==='agent-workbench');const data=store.maintenance(work.id);
  const directory=data.entries.find(e=>e.title==='约束改为可折叠的真实目录树');
  assert.deepEqual(directory.links.filter(link=>data.notes.some(note=>note.file===link.file)).map(link=>link.title),['按真实目录展示约束']);
  const note=data.notes.find(n=>n.title==='同一批决策提供四种阅读视图');assert.ok(note.alternatives.length>=2);assert.equal(note.status,'implemented');
});
