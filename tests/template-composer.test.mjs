import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { composeDefault, defaultTemplate, detectTemplateContext } from '../src/template-composer.mjs';
import { mergeTemplateDraft, changeConfiguration, relocateDraft } from '../web/template-draft.js';
import { fixture } from './helpers.mjs';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const defaults=defaultTemplate().configuration.defaults;
test('every allowed stack combination renders nonempty rules and only valid relative index links',()=>{
  const coverage=new Map();let combinations=0;
  for(const frontend of ['vue','react','none'])for(const backend of ['go','python','none'])for(const database of ['postgres','sqlite','none'])for(const cache of ['redis','none'])for(const storage of ['local','oss','none']) {
    if(backend==='none' && [database,cache,storage].some(value=>value!=='none'))continue;
    const selection={frontendLanguage:frontend==='none'?'none':'typescript',frontendFramework:frontend,backendLanguage:backend,backendFramework:backend==='go'?'gozero':backend==='python'?'fastapi':'none',database,cache,storage};
    const {files}=composeDefault(selection);combinations++;
    for(const [key,value] of Object.entries(selection))coverage.set(`${key}:${value}`,true);
    assert.ok(files.every(file=>file.content.trim().length>30));
    assert.ok(files.every(file=>file.file==='AGENTS.md'||file.file.startsWith('.agent-workbench/rules/')));
    const index=files.find(file=>file.file.endsWith('/index.md')).content;
    for(const [,href] of index.matchAll(/\]\(([^)]+)\)/g)){const link=href.replace(/^<|>$/g,'');assert.ok(files.some(file=>file.file==='.agent-workbench/rules/'+link));}
    const body=files.map(file=>file.content).join('\n');
    if(frontend==='react')assert.ok(!body.includes('Composition API'));
    if(frontend==='vue')assert.ok(!body.includes('Hook'));
    if(backend==='python')assert.ok(!body.includes('GORM')&&!body.includes('goctl'));
    if(backend==='go')assert.ok(!body.includes('SQLAlchemy')&&!body.includes('FastAPI'));
    if(storage==='local')assert.ok(body.includes('不自动创建空状态')&&!body.includes('对象存储（OSS）'));
    if(storage==='oss')assert.ok(body.includes('不隐式写入本地盘')&&!body.includes('## 本地文件'));
    if(cache==='none')assert.ok(!body.includes('## Redis 与业务缓存'));
    if(database==='none')assert.ok(!body.includes('## GORM 与模型建表')&&!body.includes('## SQLAlchemy'));
    if(database!=='none')assert.ok(body.includes(`${backend==='go'?'Go':'Python'} × ${database==='sqlite'?'SQLite':'PostgreSQL'}`));
    assert.deepEqual(composeDefault(selection),composeDefault(selection));
  }
  assert.equal(combinations,111);
  for(const group of defaultTemplate().configuration.groups)for(const field of group.fields)for(const option of field.options)assert.ok(coverage.has(`${field.id}:${option.value}`));
});
test('incompatible or invented selections fail instead of producing empty placeholder modules',()=>{
  for(const selection of [null,{},[],{...defaults,backendLanguage:'python'},{...defaults,database:'mysql'},{...defaults,provider:'invented'},{...defaults,cache:{value:'redis'}}])assert.throws(()=>composeDefault(selection));
  const switched=changeConfiguration(defaultTemplate().configuration,defaults,'backendLanguage','python');
  assert.deepEqual(changeConfiguration(defaultTemplate().configuration,defaults),defaults);
  assert.equal(switched.backendFramework,'fastapi');assert.equal(switched.database,'postgres');assert.doesNotThrow(()=>composeDefault(switched));
  const none=changeConfiguration(defaultTemplate().configuration,defaults,'backendLanguage','none');
  assert.equal(none.database,'none');assert.equal(none.storage,'none');assert.equal(none.cache,'none');assert.doesNotThrow(()=>composeDefault(none));
});
test('detection reads known manifests, resolves mixed frontend dependencies from entries, and skips symlinks',t=>{
  const f=fixture(t);f.write('web/package.json',JSON.stringify({dependencies:{react:'19',vue:'3'},devDependencies:{typescript:'5'}}));
  f.write('web/src/main.tsx',"import {createRoot} from 'react-dom/client';");
  f.write('python/pyproject.toml','[project]\ndependencies = ["fastapi>=0.115", "SQLAlchemy[asyncio]>=2", "aiosqlite>=0.21"]');
  const before=fs.readdirSync(f.projectRoot);const result=detectTemplateContext(f.projectRoot);
  assert.deepEqual(result.detected,{frontendLanguage:'typescript',frontendFramework:'react',backendLanguage:'python',backendFramework:'fastapi',database:'sqlite',cache:'none'});
  assert.ok(!('storage' in result.detected));assert.deepEqual(fs.readdirSync(f.projectRoot),before);
  fs.unlinkSync(path.join(f.projectRoot,'web/package.json'));fs.symlinkSync('/etc/passwd',path.join(f.projectRoot,'web/package.json'));
  const safe=detectTemplateContext(f.projectRoot);assert.ok(!safe.detected.frontendFramework);assert.match(safe.warnings.join(' '),/符号链接/);
});
test('unreadable layout candidates never block editing or invent a detected stack',t=>{
  const f=fixture(t);f.write('web','not a directory');f.write('package.json','invalid JSON');
  const result=detectTemplateContext(f.projectRoot);assert.deepEqual(result.detected,{});assert.ok(result.warnings.length>=2);
});
test('ambiguous frameworks and backends are not guessed; go database and cache are grounded in dependencies',t=>{
  const f=fixture(t);f.write('web/package.json',JSON.stringify({dependencies:{react:'19',vue:'3',typescript:'5'}}));
  f.write('go.mod','module example\nrequire (\ngithub.com/zeromicro/go-zero v1\ngorm.io/driver/postgres v1\ngithub.com/redis/go-redis/v9 v9\n)');
  let result=detectTemplateContext(f.projectRoot);assert.equal(result.detected.database,'postgres');assert.equal(result.detected.cache,'redis');assert.ok(!result.detected.frontendFramework);
  f.write('pyproject.toml','dependencies = ["fastapi>=0.115"]');result=detectTemplateContext(f.projectRoot);assert.ok(!result.detected.backendLanguage);assert.match(result.warnings.join(' '),/多种后端/);
});
test('three-way template updates preserve project files and expose divergent edits and deletions',()=>{
  const file=(name,content)=>({file:name,content});
  const previous=[file('a.md','old'),file('b.md','same')];
  const current=[file('a.md','mine'),file('b.md','same'),file('business.md','keep')];
  const next=[file('a.md','new'),file('c.md','added')];
  const result=mergeTemplateDraft(current,previous,next);
  assert.deepEqual(result.files,[file('a.md','mine'),file('business.md','keep'),file('c.md','added')]);
  assert.deepEqual(result.conflicts,[{file:'a.md',current:'mine',incoming:'new'}]);
  assert.deepEqual(mergeTemplateDraft([file('a.md','edited')],previous,previous).files,[file('a.md','edited')]);
  assert.equal(mergeTemplateDraft([],previous,[file('a.md','new')]).conflicts[0].current,null);
  assert.equal(mergeTemplateDraft([file('a.md','edited')],previous,[]).conflicts[0].incoming,null);
  assert.equal(mergeTemplateDraft([file('AGENTS.md','business')],[],[file('AGENTS.md','template')]).conflicts.length,1);
});

test('relocating a rule updates inbound and outgoing known links without rewriting code or unrelated links',()=>{
  const root='.agent-workbench/rules/';
  const files=[
    {file:'AGENTS.md',content:'[规则](.agent-workbench/rules/架构.md#地图)'},
    {file:root+'index.md',content:'[架构](<架构.md>)\n[其他](系统设计.md)\n```md\n[x](架构.md)\n```\n`[x](架构.md)`'},
    {file:root+'架构.md',content:'[设计](系统设计.md)\n[README](../../README.md)\n[外站](https://example.com/)\n[ref]: 系统设计.md#边界'},
    {file:root+'系统设计.md',content:'# 系统设计'},
  ];
  const result=relocateDraft(files,root+'架构.md',root+'主题/架构说明.md');
  assert.match(result.files[0].content,/主题\/架构说明\.md#地图|%E4%B8%BB%E9%A2%98/);
  const index=result.files[1].content;assert.ok(index.includes('[其他](系统设计.md)'));assert.ok(index.includes('```md\n[x](架构.md)'));assert.ok(index.includes('`[x](架构.md)`'));
  const moved=result.files[2];assert.equal(moved.file,root+'主题/架构说明.md');assert.ok(moved.content.includes('../%E7%B3%BB%E7%BB%9F%E8%AE%BE%E8%AE%A1.md'));assert.ok(moved.content.includes('../../README.md'));assert.equal(result.warnings.length,1);
  assert.throws(()=>relocateDraft(files,root+'架构.md',root+'系统设计.md'),/同名/);
});

test('scaffold policies retain agreed specifics while project fact resources are never activated as empty rules',()=>{
  const value=defaultTemplate();const text=value.files.map(item=>item.content).join('\n');
  for(const detail of ['唯一业务键','同一事务','高频','永久留存','一次性 schema','feat/<需求名>','worktree','分块','PR','明确要求实施','AutoMigrate 常开','同批提供','1 MB','413','403','401','失效','冷行','热点行'])assert.ok(text.includes(detail),detail);
  assert.equal(value.resources.length,2);assert.ok(value.resources.every(item=>item.content.length>100));
  assert.ok(!value.files.some(item=>/\/(架构|系统设计)\.md$/.test(item.file)));
  assert.ok(value.files.some(item=>item.file.endsWith('/技术栈/前端.md')));
  assert.ok(!text.includes('~/.claude/')&&!text.includes('model: opus')&&!text.includes('mcp__playwright__'));
});

test('scaffold source dispositions point to real portable rule or guide resources and state external gaps',()=>{
  const xml=fs.readFileSync('docs/research/scaffold-rule-map.xml','utf8');assert.equal(XMLValidator.validate(xml),true);
  const value=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(xml)['scaffold-map'];
  const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];const ids=new Set();let count=0;
  assert.equal(value.source.length,9);
  for(const source of value.source){assert.match(source.sha256,/^[a-f\d]{64}$/);for(const item of array(source.item)){
    assert.ok(!ids.has(item.id));ids.add(item.id);count++;
    assert.ok(item.status&&item.treatment&&item.excerpt);assert.match(item.fingerprint,/^[a-f\d]{16}$/);
    for(const target of array(item.target)){assert.match(target.file,/^templates\/default\/(?:rules|guides)\/[a-z-]+\.md$/);assert.ok(fs.statSync(target.file).isFile());}
    assert.ok(array(item.target).length||item.status==='项目指南');
  }}
  assert.ok(count>300);assert.equal(array(value['external-gaps'].gap).length,5);
  assert.ok(value['semantic-review'].includes('不能证明语义等价'));
});
