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
  fs.writeFileSync(input,JSON.stringify({file:'AGENTS.md',title:'Candidate',reason:'Why',category:'process',source:'User',content:'# Proposed'}));
  const result = run(skill,['propose','--project',f.project.id,'--input',input,'--data',f.data],f.root);
  assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).status,'pending');
  assert.equal(fs.existsSync(path.join(f.projectRoot,'AGENTS.md')),false);
});
test('parallel CLI records do not lose updates',async t => {
  const f = fixture(t); const files = [0,1,2,3].map(index => { const file = path.join(f.root,`entry-${index}.json`); fs.writeFileSync(file,JSON.stringify({title:`Entry ${index}`,category:'testing',background:'Why',result:'Done'})); return file; });
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

test('maintenance template records through Skill once and leaves project constraints unchanged',t=>{
  const f=fixture(t);const original='# Project constraints\n';f.write('AGENTS.md',original);
  const template=fs.readFileSync('skills/agent-workbench/assets/maintenance/record.xml','utf8');
  const input=path.join(f.root,'maintenance.xml');fs.writeFileSync(input,template);
  const args=['record','--project',f.project.id,'--data',f.data,'--input',input];
  assert.notEqual(run(skill,args,f.root).status,0);assert.equal(f.store.journal(f.project.id).length,0);
  const fields={title:'Update delivery checks',category:'testing',background:'Cover actual delivery behavior',result:'Added and ran isolated checks',verification:'Isolated checks passed',operationId:'maintenance-template'};
  let filled=template;
  for(const [name,value] of Object.entries(fields)) filled=filled.replace(new RegExp(`<${name}>[\\s\\S]*?</${name}>`),`<${name}><![CDATA[${value}]]></${name}>`);
  filled=filled.replace('<relatedFiles></relatedFiles>','<relatedFiles><file>AGENTS.md</file></relatedFiles>');
  fs.writeFileSync(input,filled);
  const first=run(skill,args,f.root);assert.equal(first.status,0,first.stderr);
  const retry=run(skill,args,f.root);assert.equal(retry.status,0,retry.stderr);assert.equal(JSON.parse(retry.stdout).replayed,true);
  assert.equal(JSON.parse(retry.stdout).key,JSON.parse(first.stdout).key);assert.equal(f.store.journal(f.project.id).length,1);
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),original);
  const context=JSON.parse(run(skill,['context','--project',f.project.id,'--data',f.data],f.root).stdout);
  assert.equal(context.rules[0].content,original);assert.equal(context.modules.length,0);assert.ok(!JSON.stringify(context).includes(fields.result));
});

test('XML change and proposal templates preserve Markdown, review, replay and conflict behavior',t=>{
  const f=fixture(t);const original='# Original\n';f.write('AGENTS.md',original);
  const content='# 新约束\n\n```js\nconst value = "<tag> & text";\n```\n';
  const input=path.join(f.root,'input.xml');
  const fill=(command,values)=>{
    let text=fs.readFileSync(`skills/agent-workbench/assets/constraints/${command}.xml`,'utf8');
    for(const [key,value] of Object.entries(values)) text=text.replace(new RegExp(`<${key}>[\\s\\S]*?</${key}>`),()=>`<${key}><![CDATA[${value}]]></${key}>`);
    fs.writeFileSync(input,text);
  };
  const shared={title:'XML constraint',reason:'User request',source:'User',category:'process',content};
  const runInput=command=>run(skill,[command,'--project',f.project.id,'--data',f.data,'--input',input],f.root);
  fill('propose',shared);
  const proposal=runInput('propose');assert.equal(proposal.status,0,proposal.stderr);assert.equal(JSON.parse(proposal.stdout).status,'pending');
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),original);
  fill('change',{...shared,baseHash:f.store.document(f.project.id,'AGENTS.md').hash,operationId:'xml-change'});
  const first=runInput('change');assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).status,'recorded');
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),content);
  const replay=runInput('change');assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).id,JSON.parse(first.stdout).id);assert.equal(f.store.journal(f.project.id).length,1);
  fill('change',{...shared,baseHash:f.store.document(f.project.id,'AGENTS.md').hash,operationId:'xml-conflict',content:'# Next'});
  f.write('AGENTS.md','# External edit\n');assert.notEqual(runInput('change').status,0);
  assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),'# External edit\n');
  fill('change',{...shared,operationId:'xml-new',content:'# New module'});
  let text=fs.readFileSync(input,'utf8').replace('<file>AGENTS.md</file>','<file>.agent-workbench/rules/new.md</file>');fs.writeFileSync(input,text);
  const created=runInput('change');assert.equal(created.status,0,created.stderr);assert.equal(fs.readFileSync(path.join(f.projectRoot,'.agent-workbench/rules/new.md'),'utf8'),'# New module');
});

test('malformed XML makes no change or record',t=>{
  const f=fixture(t);f.write('AGENTS.md','# Original');const input=path.join(f.root,'bad.xml');
  fs.writeFileSync(input,'<change><file>AGENTS.md</file><content><![CDATA[# New]]></content><content>duplicate</content></change>');
  const result=run(cli,['change','--project',f.project.id,'--data',f.data,'--input',input],f.root);
  assert.notEqual(result.status,0);assert.match(result.stderr,/重复/);assert.equal(fs.readFileSync(path.join(f.projectRoot,'AGENTS.md'),'utf8'),'# Original');assert.equal(f.store.proposals().length,0);assert.equal(f.store.journal(f.project.id).length,0);
});
