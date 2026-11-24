#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbench } from './store.mjs';
import { verifyNotes, planArchive, applyArchive } from './notes.mjs';

const args = process.argv.slice(2); const command = args[0];
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (!['projects', 'context', 'read', 'journal', 'maintenance', 'propose', 'change', 'record', 'notes'].includes(command)) throw Error('可用命令：projects/context/read/journal/maintenance/propose/change/record/notes。change --project <id> --input <JSON文件> 直接修改并记录；没有提案批准命令。');
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
  if (command === 'propose') { const input = JSON.parse(fs.readFileSync(option('--input'), 'utf8')); result = store.propose({...input,projectId:input.projectId ?? project}); }
  if (command === 'change') { const input=JSON.parse(fs.readFileSync(option('--input'),'utf8')); result=store.writeChange({...input,projectId:project}); }
  if (command === 'record') { const input = JSON.parse(fs.readFileSync(option('--input'), 'utf8')); result = store.record(input.projectId ?? project, input); }
  if (command === 'notes') {
    const action=option('--action','verify');
    if (action === 'verify') { result=verifyNotes(store,project,{baseRef:option('--base-ref','HEAD')}); if (!result.ok) process.exitCode=1; }
    else if (action === 'archive') result=planArchive(store,project,{file:option('--file'),successor:option('--successor')});
    else if (action === 'apply') result=applyArchive(store,project,JSON.parse(fs.readFileSync(option('--input'),'utf8')));
    else throw Error('notes --action 只支持 verify、archive（只读生成计划）、apply（执行归档计划）');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
