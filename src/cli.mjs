#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbench } from './store.mjs';
import { verifyNotes, planArchive, applyArchive } from './notes.mjs';
import { readWriteInput } from './cli-input.mjs';
import { Architecture } from './architecture.mjs';
import { legacyArchitecture } from './architecture-legacy.mjs';

const args = process.argv.slice(2); const command = args[0];
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (!['projects', 'context', 'read', 'journal', 'maintenance', 'propose', 'change', 'record', 'notes','architecture'].includes(command)) throw Error('可用命令：projects/context/read/journal/maintenance/propose/change/record/notes/architecture。没有提案批准命令。');
  const store = new Workbench(option('--data', process.env.AGENT_WORKBENCH_DATA ?? path.join(root, '.runtime/workbench')));
  const projectArg = option('--project');
  const requested = path.resolve(projectArg ?? '.');
  const candidates = store.registry.projects.filter(p => p.id === projectArg || p.root === requested || requested.startsWith(p.root + path.sep)).sort((a,b) => b.root.length - a.root.length);
  let chosen = candidates[0];
  if (chosen && chosen.id !== projectArg) {
    let cursor = requested;
    while (cursor !== chosen.root && cursor !== path.dirname(cursor)) {
      if (fs.existsSync(path.join(cursor,'.git'))) { chosen = undefined; break; }
      cursor = path.dirname(cursor);
    }
  }
  const project = projectArg === 'global' ? 'global' : chosen?.id;
  let result;
  if (command === 'projects') result = store.registry.projects;
  if (command === 'context') result = store.context(project, option('--query', ''));
  if (command === 'read') result = store.document(project, option('--file'));
  if (command === 'maintenance') { result = store.maintenance(project); const query = option('--query','').toLowerCase(); if (query) { result.notes = result.notes.filter(note => JSON.stringify(note).toLowerCase().includes(query)); result.entries = result.entries.filter(entry => JSON.stringify(entry).toLowerCase().includes(query)); } }
  if (command === 'journal') { const query = option('--query','').toLowerCase(); result = store.journal(project).filter(entry => `${entry.title} ${entry.content}`.toLowerCase().includes(query)); }
  if (command === 'propose') { const input = readWriteInput(option('--input'),command); result = store.propose({...input,projectId:input.projectId ?? project}); }
  if (command === 'change') { const input=readWriteInput(option('--input'),command); result=store.writeChange({...input,projectId:project}); }
  if (command === 'record') { const input = readWriteInput(option('--input'),command); result = store.record(input.projectId ?? project, input); }
  if (command === 'notes') {
    const action=option('--action','verify');
    if (action === 'verify') { result=verifyNotes(store,project,{baseRef:option('--base-ref','HEAD')}); if (!result.ok) process.exitCode=1; }
    else if (action === 'archive') result=planArchive(store,project,{file:option('--file'),successor:option('--successor')});
    else if (action === 'apply') result=applyArchive(store,project,JSON.parse(fs.readFileSync(option('--input'),'utf8')));
    else throw Error('notes --action 只支持 verify、archive（只读生成计划）、apply（执行归档计划）');
  }
  if (command === 'architecture') {
    const service=new Architecture(store), action=option('--action','list');
    if (action==='list') result=service.list(project);
    else if (action==='read') result=service.read(project,option('--version'));
    else if (action==='status') result=service.status(project,option('--version'));
    else if (action==='request') result=service.request(project,{focus:option('--focus','')});
    else if (action==='verify') { const model=await service.prepare(project,fs.readFileSync(option('--input'),'utf8')); result={ok:true,graphs:model.graphs.length,nodes:model.graphs.reduce((n,g)=>n+g.nodes.length,0),snapshot:model.snapshot}; }
    else if (action==='import') result=await service.import(project,fs.readFileSync(option('--input'),'utf8'));
    else if (action==='legacy') result=await service.import(project,legacyArchitecture(service,project,option('--file')));
    else throw Error('architecture --action 支持 list/read/status/request/verify/import/legacy；采用版本请在看板核对。');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
