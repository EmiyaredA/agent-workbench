import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const manifest = JSON.parse(fs.readFileSync('package.json','utf8'));
const archive = path.resolve(`dist/${manifest.name}-${manifest.version}.tgz`);
if (!fs.existsSync(archive)) throw Error('请先运行 npm run build');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'awb-package-'));
let child;
try {
  const extracted = spawnSync('tar',['-xzf',archive,'-C',temp],{encoding:'utf8'});
  assert.equal(extracted.status,0,extracted.stderr);
  const root = path.join(temp,'package');
  const env = {...process.env,PATH:temp,npm_execpath:path.join(temp,'absent-npm.mjs'),npm_config_offline:'true',AGENT_WORKBENCH_DATA:path.join(temp,'unused-data')};
  for (const file of ['LICENSE','NOTICE','node_modules/mini-trellis-core/LICENSE','node_modules/diff/LICENSE','node_modules/marked/LICENSE.md','node_modules/dompurify/LICENSE-MPL','node_modules/@phosphor-icons/web/LICENSE']) {
    assert.ok(fs.statSync(path.join(root,file)).isFile(),file);
  }
  assert.equal(fs.existsSync(path.join(root,'node_modules/playwright')),false);
  assert.equal(fs.existsSync(path.join(root,'.runtime')),false);
  const data = path.join(temp,'state with spaces');
  child = spawn(process.execPath,[path.join(root,'start.mjs'),'--port','0','--data',data],{cwd:os.tmpdir(),env,stdio:['ignore','pipe','pipe']});
  let stdout = '', stderr = '';
  child.stderr.on('data',chunk => {stderr += chunk;});
  const base = await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(Error('Package startup timed out: '+stderr)),15_000);
    child.stdout.on('data',chunk => {
      stdout += chunk;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    child.once('error',error => {clearTimeout(timeout); reject(error);});
    child.once('exit',code => {clearTimeout(timeout); reject(Error(`Package exited ${code}: ${stderr}`));});
  });
  const session = await fetch(base+'/api/session').then(r => r.json());
  assert.equal(session.dataDir,data);
  assert.equal(session.demo,false);
  const request = async (route,body) => {
    const response = await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Workbench-Nonce':session.nonce},body:JSON.stringify(body)});
    const output = await response.json();
    assert.ok(response.ok,JSON.stringify(output));
    return output;
  };
  for (const route of ['/','/app.js','/maintenance.js','/theme.css','/vendor/marked.js','/vendor/purify.js','/icons/style.css','/icons/Phosphor.woff2','/assets/kurisu-avatar.png','/favicon.ico','/api/skill']) {
    const response = await fetch(base+route);
    assert.equal(response.status,200,route);
    assert.ok((await response.arrayBuffer()).byteLength,route);
  }
  const templates=await fetch(base+'/api/templates').then(r=>r.json());assert.equal(templates.find(item=>item.id==='default').files.length,8);
  const composed=await request('/api/templates/default/compose',{selection:{...templates[0].selection,backendLanguage:'python',backendFramework:'fastapi',database:'sqlite',cache:'none',storage:'local'}});
  assert.ok(composed.files.some(file=>file.content.includes('Python × SQLite')));
  assert.ok(composed.files.some(file=>file.content.includes('## 本地文件')));
  assert.equal(composed.files.some(file=>file.content.includes('## Redis 与业务缓存')),false);
  assert.ok(composed.files.some(file=>file.file==='.agent-workbench/rules/技术栈/数据与存储.md'));
  assert.deepEqual(templates.find(item=>item.id==='default').resources.map(item=>item.name),['架构.md','系统设计.md']);
  assert.equal((await fetch(base+'/template-draft.js')).status,200);
  for(const file of ['references/maintenance-records.md','assets/maintenance/record.xml','assets/constraints/change.xml','assets/constraints/propose.xml']){
    const relative='skills/agent-workbench/'+file;
    const response=await fetch(base+'/api/skill?file='+encodeURIComponent(relative));assert.equal(response.status,200);
    assert.equal((await response.json()).content,fs.readFileSync(path.join(root,relative),'utf8'));
  }
  const projectRoot = path.join(temp,'project');
  fs.mkdirSync(projectRoot);
  fs.writeFileSync(path.join(projectRoot,'AGENTS.md'),'# Before\n');
  const project = await request('/api/projects',{root:projectRoot,name:'Offline package'});
  const proposal = await request('/api/proposals',{projectId:project.id,file:'AGENTS.md',title:'Offline diff',category:'process',reason:'Verify packaged dependencies',source:'Isolated package check',content:'# After\n'});
  const diff = await fetch(base+'/api/proposals/'+proposal.id).then(r => r.json());
  assert.equal(diff.baseContent,'# Before\n');
  assert.equal(diff.content,'# After\n');
  for (const script of ['src/cli.mjs','skills/agent-workbench/scripts/workbench.mjs']) {
    const output = spawnSync(process.execPath,[path.join(root,script),'context','--project',project.id,'--data',data],{cwd:os.tmpdir(),env:{...env,AGENT_WORKBENCH_ROOT:root},encoding:'utf8'});
    assert.equal(output.status,0,output.stderr);
    assert.equal(JSON.parse(output.stdout).rules[0].content,'# Before\n');
  }
  const recordInput=path.join(temp,'record.xml');
  fs.writeFileSync(recordInput,'<record><title>Offline XML</title><category>testing</category><background>Check packaged input</background><result><![CDATA[Read <XML> & preserved text]]></result><relatedFiles><file>AGENTS.md</file></relatedFiles><operationId>offline-xml</operationId></record>');
  const recorded=spawnSync(process.execPath,[path.join(root,'skills/agent-workbench/scripts/workbench.mjs'),'record','--project',project.id,'--data',data,'--input',recordInput],{cwd:os.tmpdir(),env:{...env,AGENT_WORKBENCH_ROOT:root},encoding:'utf8'});
  assert.equal(recorded.status,0,recorded.stderr);assert.equal(JSON.parse(recorded.stdout).replayed,false);
  assert.equal(fs.readFileSync(path.join(projectRoot,'AGENTS.md'),'utf8'),'# Before\n');
  assert.equal(stderr,'');
  console.log('Packaged offline startup passed: no npm, local assets, licenses, registration, proposal diff, CLI and Skill.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = once(child,'exit'); child.kill(); await ended;
  }
  fs.rmSync(temp,{recursive:true,force:true});
}
