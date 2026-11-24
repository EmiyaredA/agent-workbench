import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../src/server.mjs';
import { atomic } from '../src/store.mjs';

const output = path.resolve(process.env.AWB_QA_DIR ?? '.local/ui-acceptance');
fs.mkdirSync(output,{recursive:true});
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'awb-ui-')));
const projectRoot = path.join(temporary,'project'); fs.mkdirSync(projectRoot);
const original = '# 项目约束\n\n本文件保存项目的长期偏好与工作边界。\n\n## 工作方式\n\n- 修改前确认目标文件。\n- 规则变更需先审核。\n- 按需读取模块文档。\n\n## 按任务读取\n\n- [前端约束](docs/agent/frontend.md)\n';
atomic(path.join(projectRoot,'AGENTS.md'),original);
atomic(path.join(projectRoot,'docs/agent/frontend.md'),'# 前端约束\n\n- 页面以文档内容为主。\n- 使用系统字体，支持离线阅读。\n');
atomic(path.join(projectRoot,'.agents/notes/implemented/architecture/2026-11-24-file-first.md'),'# Agent Note: 文件作为正式来源\n\nStatus: implemented\n\n## Problem\n\n更换 Agent 后仍需理解过去的决定。\n\n## Decision\n\n正式约束保存在项目 Markdown 中。\n\n## Alternatives considered\n\n独立数据库方便检索，但增加迁移成本。\n\n## Consequences\n\n文件便于交接；首版不提供语义知识图谱。\n\n## 关联文档\n\n[项目 AGENTS.md](../../../../AGENTS.md)\n');
atomic(path.join(projectRoot,'.agents/notes/rejected/architecture/2026-11-23-observer.md'),'# Agent Note: 常驻观察服务\n\nStatus: rejected — 首版无需额外推理\n\n## Problem\n\n需要提出新约束。\n\n## Proposal\n\n常驻观察工具事件。\n\n## Alternatives considered\n\n当前 Agent 按需提出候选。\n\n## Risks\n\n增加运行负担。\n');
const globalFile = path.join(temporary,'global.md'); atomic(globalFile,'# 全局偏好\n\n- 使用中文简洁沟通。\n');
const {server,store} = createApp({dataDir:path.join(temporary,'state')});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.AWB_CHROME ?? (!process.env.CI ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome'].find(file => fs.existsSync(file)) : undefined);
let browser; let page;
const checks = []; const errors = []; const external = []; const screenshots = [];
const capture = async name => {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(180);
  const file = name+'.png'; await page.screenshot({path:path.join(output,file),fullPage:false,animations:'disabled'}); screenshots.push(file);
};
const visible = async locator => locator.waitFor({state:'visible',timeout:15000});
const check = name => { checks.push(name); console.log('PASS',name); };
const dialog = () => page.locator('#dialog');
const fill = (name,value) => dialog().locator(`[name="${name}"]`).fill(value);
const submit = () => dialog().locator('button[type=submit]').click();
const close = async () => { await dialog().locator('[data-action=close]').first().click(); await dialog().waitFor({state:'hidden'}); };
const openTab = async view => { await page.locator(`.tabs [data-view=${view}]`).click(); await page.waitForTimeout(150); };
const waitFormClosed = async () => dialog().waitFor({state:'hidden',timeout:15000});

try {
  browser = await chromium.launch({headless:true,...(executablePath ? {executablePath}:{})});
  const context = await browser.newContext({viewport:{width:1440,height:1024},deviceScaleFactor:1});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  page = await context.newPage();
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error' && !/server responded with a status of (400|409)/.test(message.text())) errors.push(message.text()); });
  page.on('request',request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto(base); await visible(page.getByRole('heading',{name:'从一个项目开始'}));
  await capture('00-empty-workspace'); check('normal startup is a real empty workspace');

  await page.locator('[data-action=register]').first().click(); await fill('name','agent-workbench'); await fill('root',path.join(temporary,'absent'));
  await submit(); await visible(dialog().locator('.form-error'));
  assert.equal(await dialog().locator('[name=name]').inputValue(),'agent-workbench');
  await capture('17-directory-error'); check('registration errors preserve entered values');
  await fill('root',projectRoot); await dialog().locator('[data-action=inspect-project]').click();
  await page.waitForFunction(() => document.querySelector('#inspect-message')?.textContent.includes('可读取'));
  await capture('01-register-project'); await submit(); await waitFormClosed();
  await visible(page.locator('.reader h1')); check('register existing project without changing its files');
  assert.equal(fs.readFileSync(path.join(projectRoot,'AGENTS.md'),'utf8'),original);
  const projectId = store.registry.projects[0].id;

  await page.locator('[data-action=global]').click(); await fill('file',globalFile); await submit(); await waitFormClosed();
  await page.locator('.header [data-action=settings]').click(); await capture('02-configure-sources');
  await fill('journalDir','docs/logs'); await submit(); await waitFormClosed();
  assert.equal(store.project(projectId).journalDir,'docs/logs'); check('configure global source and custom maintenance mapping');

  await page.locator('[data-action=scope][data-scope=global]').click(); await visible(page.locator('.reader').getByText('使用中文简洁沟通。'));
  await page.locator('[data-action=scope][data-scope=module]').click(); await visible(page.locator('.reader h1').getByText('前端约束'));
  await capture('03-read-module-rules'); await page.locator('[data-action=read-mode][data-mode=raw]').click();
  await visible(page.locator('.reader pre')); assert.ok((await page.locator('.reader pre').textContent()).includes('# 前端约束'));
  await page.locator('[data-action=read-mode][data-mode=read]').click(); await visible(page.locator('.reader h1'));
  check('global/project/module switching and raw/read modes');
  await page.locator('[data-action=scope][data-scope=project]').click(); await visible(page.locator('.reader h1'));

  await page.locator('.doc-toolbar [data-action=new-proposal]').click(); await fill('title','保留用户已有修改'); await fill('reason','避免覆盖尚未提交的工作。'); await fill('source','用户明确纠正：先保留我的修改。');
  await fill('content',original.replace('- 修改前确认目标文件。','- 保留用户已有修改。\n- 遇到冲突先展示差异。'));
  await capture('05-create-proposal'); await submit(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'保留用户已有修改',exact:true}));
  const p = store.proposals().find(item => item.title === '保留用户已有修改');
  assert.equal(fs.readFileSync(path.join(projectRoot,'AGENTS.md'),'utf8'),original); check('create proposal without applying it');
  await page.locator('[data-action=edit-proposal]').click(); await fill('content',p.content+'\n- 仅修改本次任务涉及的文件。\n'); await capture('06-edit-proposal');
  await submit(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'保留用户已有修改',exact:true}));
  assert.equal(store.proposal(p.id).revision,2); await capture('07-review-diff'); check('edit pending proposal and review real diff');

  await openTab('rules'); await visible(page.locator('.reader h1')); await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show')); await capture('main');
  await page.keyboard.press('/'); await page.locator('#search-query').fill('保留'); await visible(page.locator('#search-results button').first()); await capture('04-search');
  await page.locator('[data-action=search-kind][data-kind=proposal]').click(); await visible(page.locator('#search-results button').first());
  await page.locator('#search-results button').first().click(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'保留用户已有修改',exact:true})); check('search documents and candidates with source navigation');

  const rejected = store.propose({projectId,file:'docs/agent/frontend.md',title:'待拒绝的示例',reason:'Only a demo',source:'Fixture',content:'# 不需要的新规则'});
  await page.reload(); await visible(page.locator(`.proposal-card[data-id="${rejected.id}"]`)); await page.locator(`.proposal-card[data-id="${rejected.id}"]`).click();
  await visible(page.getByRole('heading',{name:'待拒绝的示例',exact:true})); await page.locator('[data-action=reject-proposal]').click(); await fill('reason','仅适用于本次任务，不形成长期约束。');
  await capture('10-reject'); await submit(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'待拒绝的示例',exact:true}));
  assert.equal(store.proposal(rejected.id).status,'rejected'); assert.ok(fs.readFileSync(path.join(projectRoot,'docs/agent/frontend.md'),'utf8').includes('前端约束')); check('reject candidate and retain reason without file changes');
  await page.locator('[data-action=proposal-filter][data-filter=pending]').click(); await visible(page.getByRole('heading',{name:'保留用户已有修改',exact:true}));
  await page.locator('[data-action=approve-proposal]').click(); await capture('08-approve'); await submit(); await waitFormClosed(); await visible(page.locator('.notice.success')); await visible(page.locator('.reader h1'));
  assert.equal(store.proposal(p.id).status,'applied'); assert.equal(store.journal(projectId).length,1); await capture('09-applied'); check('approve exact diff and persist updated file plus one maintenance entry');

  const conflict = store.propose({projectId,file:'AGENTS.md',title:'冲突验收提案',reason:'Example',source:'Fixture',content:store.document(projectId,'AGENTS.md').content+'\n- 候选补充。\n'});
  fs.appendFileSync(path.join(projectRoot,'AGENTS.md'),'\n- 用户后续编辑。\n');
  await openTab('proposals'); await visible(page.locator(`.proposal-card[data-id="${conflict.id}"]`)); await page.locator(`.proposal-card[data-id="${conflict.id}"]`).click();
  await visible(page.locator('.notice.warning')); await capture('11-conflict'); assert.equal(await page.locator('[data-action=approve-proposal]').count(),0);
  await page.locator('[data-action=rebase-proposal]').click(); await submit(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'冲突验收提案',exact:true}));
  const rebased = store.proposals().find(item => item.id !== conflict.id && item.title === conflict.title); assert.equal(rebased.status,'pending'); assert.equal(store.proposal(conflict.id).status,'superseded');
  assert.ok(fs.readFileSync(path.join(projectRoot,'AGENTS.md'),'utf8').includes('用户后续编辑')); check('conflict blocks write; rebase remains pending and preserves external edits');
  await page.locator('[data-action=reject-proposal]').click(); await fill('reason','冲突验收完成，不应用候选。'); await submit(); await waitFormClosed();

  await openTab('journal'); await visible(page.getByRole('heading',{name:'维护路径',exact:true})); await page.locator('[data-action=add-journal]').click();
  for (const [name,value] of Object.entries({title:'浏览器验收记录',background:'验证完整闭环',result:'记录保存在自定义维护目录',verification:'实际运行本地浏览器',next:'后续按真实项目维护',topic:'AGENTS.md'})) await fill(name,value);
  await capture('13-create-journal-entry'); await submit(); await waitFormClosed(); await visible(page.getByRole('heading',{name:'浏览器验收记录',exact:true})); await capture('12-maintenance-timeline');
  assert.equal(store.journal(projectId).length,2); await page.locator('#month-filter').selectOption(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}).slice(0,7)); await visible(page.getByRole('heading',{name:'浏览器验收记录',exact:true})); check('add and filter maintenance entries using configured directory');
  await page.locator('[data-action=log-mode][data-mode=decision]').click(); await page.locator('[data-action=note-status][data-status=rejected]').click(); await visible(page.getByRole('heading',{name:'常驻观察服务',exact:true}));
  await page.locator('[data-action=note-status][data-status=implemented]').click(); await visible(page.getByRole('heading',{name:'文件作为正式来源',exact:true})); await page.locator('[data-action=document]').click(); await visible(dialog().getByRole('heading',{name:'文件作为正式来源',exact:true})); await capture('14-decision-detail');
  await dialog().getByRole('link',{name:'项目 AGENTS.md'}).click(); await visible(dialog().getByRole('heading',{name:'项目约束',exact:true})); await close(); check('decision status filters, detail drawer and relative Markdown links');

  await page.locator('[data-action=connect]').click(); await visible(page.getByRole('heading',{name:'让 Code Agent 读取项目上下文',exact:true})); await capture('15-skill-connection');
  await page.getByRole('button',{name:'复制命令',exact:true}).click(); assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('context --project')); check('Skill connection page and copy command');
  await openTab('proposals'); await page.locator('[data-action=proposal-filter][data-filter=pending]').click(); await visible(page.getByRole('heading',{name:'暂无待审提案',exact:true})); await capture('16-empty-proposals'); check('empty queue after settling proposals');

  atomic(path.join(projectRoot,'docs/agent/untrusted.md'),'# Untrusted\n\n<img src="https://example.invalid/x" onerror="window.__injected=true"><a href="javascript:window.__injected=true">Bad</a><div id="app" data-action="approve-proposal">fake</div>');
  await openTab('rules'); await page.locator('[data-action=scope][data-scope=module]').click(); await visible(page.locator('.file-button[data-file="docs/agent/untrusted.md"]')); await page.locator('.file-button[data-file="docs/agent/untrusted.md"]').click(); await visible(page.locator('.reader h1').getByText('Untrusted'));
  assert.equal(await page.locator('.markdown img,.markdown [data-action],.markdown [id]').count(),0); assert.equal(await page.evaluate(() => window.__injected),undefined); check('untrusted Markdown is sanitized and cannot invoke UI actions');
  await page.locator('[data-action=scope][data-scope=project]').click(); await visible(page.locator('.reader h1').getByText('项目约束',{exact:true}));
  await page.setViewportSize({width:390,height:844}); await visible(page.locator('.mobile-project')); await visible(page.locator('.reader h1').getByText('项目约束',{exact:true})); await capture('mobile'); assert.equal(await page.locator('.sidebar').count(),1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),'mobile viewport overflows');
  await page.locator('.mobile-project').selectOption('__connect'); await visible(page.getByRole('heading',{name:'让 Code Agent 读取项目上下文',exact:true})); check('mobile layout and access to secondary navigation');
  assert.deepEqual(external,[],'unexpected external network requests'); assert.deepEqual(errors,[],'browser console/runtime errors');
  check('no unexpected console errors or external asset requests');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,viewport:{width:1440,height:1024},checks,screenshots,consoleErrors:errors,externalRequests:external},null,2)+'\n');
  console.log(`UI acceptance passed: ${checks.length} checks; ${screenshots.length} screenshots in ${output}`);
} catch(error) {
  if (page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(() => {});
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,error:error.message,checks,screenshots,consoleErrors:errors,externalRequests:external},null,2)+'\n');
  throw error;
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temporary,{recursive:true,force:true});
}
