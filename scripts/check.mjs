import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
for (const file of ['web/index.html','web/style.css','web/app.js','skills/agent-workbench/SKILL.md','LICENSE','NOTICE']) {
  if (!fs.statSync(file).isFile()) throw Error('Missing required resource: '+file);
}
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(item => item.isDirectory() ? walk(path.join(dir,item.name)) : [path.join(dir,item.name)]);
const files = ['start.mjs',...['src','web','scripts','skills'].flatMap(walk)].filter(file => /\.(js|mjs)$/.test(file));
for (const file of files) {
  const result = spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if (result.status !== 0) throw Error(result.stderr || 'Syntax check failed: '+file);
}
await import('mini-trellis-core/mem');
console.log(`Checked ${files.length} JavaScript files, local UI resources and mini-trellis-core import.`);
