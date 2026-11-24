#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.env.AGENT_WORKBENCH_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)),'../../..'));
const commands = ['projects','context','read','journal','maintenance','propose','record','notes'];
try {
  if (!commands.includes(process.argv[2])) throw Error('只支持读取、查询、提案、维护记录与决策笔记操作；没有约束批准命令。可用命令：'+commands.join(', '));
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if (manifest.name !== 'agent-workbench' || !fs.existsSync(path.join(root,'src/cli.mjs'))) throw Error('不是有效的工作台目录');
  const result = spawnSync(process.execPath,[path.join(root,'src/cli.mjs'),...process.argv.slice(2)],{stdio:'inherit'});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch(error) { console.error(JSON.stringify({error:error.message+'；可设置 AGENT_WORKBENCH_ROOT 指向工作台目录。'})); process.exitCode = 1; }
