import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awb-start-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  fs.mkdirSync(path.join(root,'scripts'));
  fs.mkdirSync(path.join(root,'src'));
  fs.copyFileSync('start.mjs',path.join(root,'start.mjs'));
  fs.copyFileSync('scripts/runtime.mjs',path.join(root,'scripts/runtime.mjs'));
  const env = {...process.env, npm_config_cache:path.join(root,'cache'), npm_config_offline:'true'};
  const npm = args => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',args,{cwd:root,env,encoding:'utf8',shell:process.platform === 'win32'});
  fs.mkdirSync(path.join(root,'dependency'));
  fs.writeFileSync(path.join(root,'dependency/package.json'),JSON.stringify({name:'startup-fixture',version:'1.0.0',type:'module',main:'index.mjs',scripts:{install:'node -e "require(\'fs\').writeFileSync(\'INSTALL_SCRIPT_RAN\',\'yes\')"'}}));
  fs.writeFileSync(path.join(root,'dependency/index.mjs'),'export default "installed";');
  const packed = npm(['pack','./dependency','--ignore-scripts','--json']);
  assert.equal(packed.status,0,packed.stderr);
  const tarball = JSON.parse(packed.stdout)[0].filename;
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'startup-test',version:'1.0.0',type:'module',dependencies:{'startup-fixture':'file:'+tarball},devDependencies:{'dev-fixture':'file:'+tarball}}));
  const locked = npm(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']);
  assert.equal(locked.status,0,locked.stderr);
  fs.writeFileSync(path.join(root,'src/server.mjs'),'import value from "startup-fixture"; console.log(JSON.stringify({value,args:process.argv.slice(2)}));');
  return {root,env,run:(args=[],extra={}) => spawnSync(process.execPath,[path.join(root,'start.mjs'),...args],{cwd:os.tmpdir(),encoding:'utf8',env:{...env,...extra}})};
}

test('fresh startup installs locked runtime packages without scripts, then restarts without npm',t => {
  const f = fixture(t);
  assert.equal(fs.existsSync(path.join(f.root,'node_modules')),false);
  const args = ['--demo','--data',path.join(f.root,'data with spaces'),'--port','0'];
  const first = f.run(args);
  assert.equal(first.status,0,first.stderr);
  assert.match(first.stderr,/正在按锁文件/);
  assert.deepEqual(JSON.parse(first.stdout.trim().split('\n').at(-1)),{value:'installed',args});
  assert.equal(fs.existsSync(path.join(f.root,'node_modules/startup-fixture/INSTALL_SCRIPT_RAN')),false);
  assert.equal(fs.existsSync(path.join(f.root,'node_modules/dev-fixture')),false);
  const second = f.run(args,{npm_execpath:path.join(f.root,'absent-npm.mjs'),PATH:f.root});
  assert.equal(second.status,0,second.stderr);
  assert.equal(second.stderr,'');
  assert.deepEqual(JSON.parse(second.stdout),{value:'installed',args});
});

test('failed dependency preparation stops startup with an actionable message',t => {
  const f = fixture(t);
  const result = f.run([],{npm_execpath:path.join(f.root,'absent-npm.mjs')});
  assert.equal(result.status,1);
  assert.match(result.stderr,/运行依赖准备失败/);
  assert.equal(result.stdout,'');
  assert.equal(fs.existsSync(path.join(f.root,'.runtime')),false);
});
