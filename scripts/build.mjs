import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runtimePackages } from './runtime.mjs';
const checked = spawnSync(process.execPath,['scripts/check.mjs'],{stdio:'inherit'});
if (checked.status !== 0) process.exit(checked.status ?? 1);
fs.mkdirSync('dist',{recursive:true});
// Replace only generated program files; preserve any workspace data in dist/.runtime.
for (const name of ['src','web','skills','templates','scripts','node_modules']) fs.rmSync(path.join('dist',name),{recursive:true,force:true});
for (const name of ['start.mjs','src','web','skills','templates','LICENSE','NOTICE']) fs.cpSync(name,path.join('dist',name),{recursive:true});
fs.mkdirSync('dist/scripts',{recursive:true});
fs.copyFileSync('scripts/runtime.mjs','dist/scripts/runtime.mjs');
for (const [name, entry] of runtimePackages('.')) {
  const source = path.resolve(name);
  if (entry.optional && !fs.existsSync(source)) continue;
  const installed = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  if (installed.version !== entry.version) throw Error('Dependency differs from lockfile: '+name+'; run npm ci --ignore-scripts');
  fs.mkdirSync(path.dirname(path.join('dist',name)),{recursive:true});
  fs.cpSync(source,path.join('dist',name),{recursive:true,dereference:true});
}
const manifest = JSON.parse(fs.readFileSync('package.json','utf8'));
manifest.scripts = { start:'node start.mjs',demo:'node start.mjs --demo',agent:'node src/cli.mjs' };
delete manifest.devDependencies;
manifest.bin = { 'agent-workbench':'start.mjs' };
manifest.bundledDependencies = Object.keys(manifest.dependencies);
manifest.files = ['start.mjs','scripts/runtime.mjs','src','web','skills','templates','README.md','LICENSE','NOTICE','npm-shrinkwrap.json'];
fs.writeFileSync('dist/package.json',JSON.stringify(manifest,null,2)+'\n');
const lock = JSON.parse(fs.readFileSync('package-lock.json','utf8'));
lock.packages = Object.fromEntries(Object.entries(lock.packages).filter(([,entry]) => !entry.dev));
lock.packages[''] = {...lock.packages[''],bin:manifest.bin};
delete lock.packages[''].devDependencies;
// npm pack excludes package-lock.json; shrinkwrap preserves the offline lock in the archive.
fs.rmSync('dist/package-lock.json',{force:true});
fs.writeFileSync('dist/npm-shrinkwrap.json',JSON.stringify(lock,null,2)+'\n');
fs.writeFileSync('dist/README.md','# Agent Workbench\n\n需要 Node.js 24+。此包内置运行依赖，无需 npm 安装、无需联网。\n\n解压后进入 package 目录执行 `node start.mjs`，打开 http://127.0.0.1:4173 。默认空工作区，按 Ctrl+C 停止。\n\n`node start.mjs --demo --port 4174` 启动隔离示例；`--data /absolute/path/to/data` 指定数据目录。CLI 与 Skill 同样可离线使用。也可使用 `npm start` / `npm run demo`。\n\n完整源码、开发检查、设计与 Skill 说明：https://github.com/EmiyaredA/agent-workbench\n');
const cache = fs.mkdtempSync(path.join(os.tmpdir(),'awb-pack-'));
let packed;
try {
  packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',['pack','./dist','--pack-destination','dist','--ignore-scripts','--json','--cache',cache],{encoding:'utf8',shell:process.platform === 'win32'});
} finally { fs.rmSync(cache,{recursive:true,force:true}); }
if (packed.status !== 0) throw Error(packed.stderr || packed.error?.message || 'npm pack failed');
const [archive] = JSON.parse(packed.stdout);
console.log(`Built dist/ and dist/${archive.filename}: runtime dependencies and licenses included; Node.js 24+, no install required.`);
