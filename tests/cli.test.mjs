import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './helpers.mjs';
const cli = path.resolve('src/cli.mjs');
const skill = path.resolve('skills/agent-workbench/scripts/workbench.mjs');
const run = (script,args,cwd) => spawnSync(process.execPath,[script,...args],{cwd,encoding:'utf8'});
test('CLI and Skill wrapper read the same registry and expose no approval command',t => {
  const f = fixture(t); f.write('AGENTS.md','# Fixture'); f.write('.agent-workbench/rules/ui.md','# UI\nLarge module body');
  const output = run(skill,['context','--project',f.project.id,'--data',f.data],f.root); assert.equal(output.status,0,output.stderr);
  const context = JSON.parse(output.stdout); assert.equal(context.rules.length,1); assert.equal(context.modules[0].content,undefined);
  assert.notEqual(run(skill,['apply','--data',f.data],f.root).status,0);
});
test('CLI read from an absent workspace does not create persistent state',t => {
  const f = fixture(t); const data = path.join(f.root,'absent'); const output = run(cli,['projects','--data',data],f.root);
  assert.equal(output.status,0); assert.deepEqual(JSON.parse(output.stdout),[]); assert.equal(fs.existsSync(data),false);
});
test('CLI submits pending proposals, not effective rules',t => {
  const f = fixture(t); const input = path.join(f.root,'candidate.json');
  fs.writeFileSync(input,JSON.stringify({file:'AGENTS.md',title:'Candidate',reason:'Why',source:'User',content:'# Proposed'}));
  const result = run(skill,['propose','--project',f.project.id,'--input',input,'--data',f.data],f.root);
  assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).status,'pending');
  assert.equal(fs.existsSync(path.join(f.projectRoot,'AGENTS.md')),false);
});
test('parallel CLI records do not lose updates',async t => {
  const f = fixture(t); const files = [0,1,2,3].map(index => { const file = path.join(f.root,`entry-${index}.json`); fs.writeFileSync(file,JSON.stringify({title:`Entry ${index}`,background:'Why',result:'Done'})); return file; });
  await Promise.all(files.map(async input => {
    const child = spawn(process.execPath,[cli,'record','--project',f.project.id,'--data',f.data,'--input',input],{stdio:['ignore','ignore','pipe']});
    let error = ''; child.stderr.on('data',data => error+=data); const [code] = await once(child,'exit'); assert.equal(code,0,error);
  }));
  assert.equal(f.store.journal(f.project.id).length,4);
});
test('CLI does not inherit a parent registration inside an independent Git repository',t => {
  const f = fixture(t); const nested = path.join(f.projectRoot,'nested'); fs.mkdirSync(path.join(nested,'.git'),{recursive:true});
  const result = run(cli,['context','--data',f.data],nested); assert.notEqual(result.status,0);
});
