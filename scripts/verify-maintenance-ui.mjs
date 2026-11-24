import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../src/server.mjs';

const output=path.resolve(process.env.AWB_MAINTENANCE_QA_DIR ?? '.local/maintenance-ui');fs.mkdirSync(output,{recursive:true});
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'awb-maintenance-ui-')));
const {server,store}=createApp({demo:true,dataDir:path.join(temporary,'demo')});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath:process.env.AWB_CHROME ?? (fs.existsSync(macChrome) ? macChrome : undefined)});
const context=await browser.newContext({viewport:{width:1512,height:982}});const page=await context.newPage();
const checks=[];const screenshots=[];const errors=[];page.on('pageerror',error=>errors.push(error.message));
const capture=async name=>{await page.screenshot({path:path.join(output,name+'.png'),fullPage:page.viewportSize().width>700,style:'#toast{visibility:hidden}'});screenshots.push(name+'.png');};
const click=async action=>page.locator(`[data-action="${action}"]`).click();
const view=async name=>{await page.locator(`[data-action=maintenance-view][data-view=${name}]`).click();await page.waitForFunction(name=>new URLSearchParams(location.hash.slice(1)).get('maintenanceView')===name,name);await page.locator(`[data-action=maintenance-view][data-view=${name}].active`).waitFor();};
const choose=async (id,value)=>{await page.locator(`#${id} .dropdown-trigger`).click();await page.locator(`#${id} [role=option][data-value="${value}"]`).click();await page.waitForFunction(({id,value})=>[...document.querySelectorAll('#'+id+' [role=option]')].some(node=>node.dataset.value===value && node.getAttribute('aria-selected')==='true'),{id,value});};
const project=store.registry.projects.find(p=>p.name==='agent-workbench');
try {
  await page.goto(base+`/#project=${project.id}&view=journal`);await page.getByRole('heading',{name:'关键决定',exact:true}).waitFor();
  assert.equal(await page.locator('.maintenance-tabs button').count(),4);assert.ok(await page.locator('.decision-card').count()>=5);
  assert.equal(await page.locator('.decision-card').filter({hasText:'早期固定路径'}).count(),0);await capture('01-baseline');checks.push('four views and active baseline exclude superseded notes');
  await page.locator('.decision-card').filter({hasText:'文件作为唯一正式来源'}).click();await page.locator('.maintenance-detail h1').waitFor();
  assert.ok((await page.locator('.maintenance-detail').innerText()).includes('关联迭代'));assert.equal((await page.locator('.maintenance-detail').innerText()).includes('awb-record:'),false);
  await capture('02-decision-detail');const detailUrl=page.url();await page.reload();await page.locator('.maintenance-detail h1').waitFor();assert.equal(page.url(),detailUrl);checks.push('selection and full decision detail survive reload');
  await page.locator('.detail-related [data-kind=entry]').first().click();await page.locator('.maintenance-content h2').filter({hasText:'项目迭代'}).waitFor();
  await capture('03-linked-iteration');await click('maintenance-close');await page.goBack();await page.locator('.maintenance-detail').waitFor();await click('maintenance-close');checks.push('decision to iteration links and browser navigation');
  await view('timeline');await page.locator('.iteration-row').first().waitFor();await capture('04-timeline');
  await choose('month-filter','2026-10');await page.waitForFunction(()=>[...document.querySelectorAll('.iteration-row time')].every(node=>node.textContent.startsWith('2026-10')));assert.ok(await page.locator('.iteration-row').count()>0);
  await click('maintenance-reset');await choose('maintenance-kind','decision');await page.getByText('日期来自笔记首次提出日，不表示方案的实际实施时间。').waitFor();await capture('05-first-proposed');checks.push('month filters and distinct first-proposed timeline');
  await view('pitfalls');await page.locator('.pitfall-card').first().waitFor();assert.ok(await page.locator('.pitfall-card').count()>2);await capture('06-pitfalls');checks.push('pitfalls include alternatives as well as rejected decisions');
  await view('list');await choose('maintenance-status','archived');await page.locator('.decision-table tbody tr').first().waitFor();assert.equal(await page.locator('.decision-table tbody tr').count(),1);await capture('07-archived-list');
  await choose('maintenance-status','superseded');await page.getByRole('button',{name:'早期固定路径的读取方式',exact:true}).waitFor();
  await click('maintenance-reset');await page.locator('#maintenance-query').fill('常驻观察');await page.locator('#maintenance-query').press('Enter');await page.getByRole('button',{name:'常驻观察服务',exact:true}).waitFor();assert.equal(await page.locator('.decision-table tbody tr').count(),1);checks.push('list lifecycle filters, exact replacement and keyword query');
  await click('maintenance-reset');await choose('maintenance-category','testing');await page.getByRole('button',{name:'验证结果随迭代记录保存',exact:true}).waitFor();await click('maintenance-reset');await choose('maintenance-sort','references');checks.push('category and reference sort use shared metadata');
  await click('add-journal');await page.locator('#dialog[open]').waitFor();
  for (const [name,value] of Object.entries({title:'浏览器维护关联验收',background:'跨 Agent 交接需要关联决定',result:'四视图读取同一批文件',verification:'隔离浏览器完成交互',next:'观察实际使用规模',relatedFiles:'AGENTS.md'})) await page.locator(`#dialog [name=${name}]`).fill(value);
  await choose('record-category','testing');await page.locator('.record-decisions summary').click();await page.locator('.decision-checkbox').filter({hasText:'文件作为唯一正式来源'}).locator('input').check();
  const before=store.journal(project.id).length;let onceFailure=true;
  await page.route('**/api/projects/*/journal',async route=>{
    if (route.request().method()==='POST' && onceFailure) {onceFailure=false;const response=await route.fetch();assert.equal(response.status(),201);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟响应丢失：记录已落盘，请重试'})});}
    else await route.continue();
  });
  await page.locator('#dialog [type=submit]').click();await page.getByText('模拟响应丢失：记录已落盘，请重试').waitFor();assert.equal(await page.locator('#dialog [name=title]').inputValue(),'浏览器维护关联验收');assert.equal(store.journal(project.id).length,before+1);await capture('08-safe-retry');
  await page.locator('#dialog [type=submit]').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.locator('.maintenance-detail').waitFor();assert.equal(store.journal(project.id).length,before+1);assert.equal(await page.locator('.maintenance-detail').getByText(/awb-record:/).count(),0);await capture('09-record-linked');checks.push('iteration category and decision link persist; lost-response retry adds one record');
  await click('maintenance-close');await view('baseline');await page.locator('.decision-card').first().click();await page.locator('.maintenance-detail').waitFor();
  await page.setViewportSize({width:390,height:844});await page.locator('.maintenance-detail[aria-modal=true]').waitFor();await capture('10-mobile-detail');
  assert.equal(await page.locator('.maintenance-content').evaluate(node=>node.inert),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('.maintenance-detail').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.maintenance-detail')),true);await page.keyboard.press('Escape');await page.locator('.maintenance-detail').waitFor({state:'hidden'});await capture('11-mobile-baseline');checks.push('mobile drawer traps focus, closes with Escape and has no viewport overflow');
  await view('timeline');await page.locator('#month-filter .dropdown-trigger').press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');assert.equal(await page.locator('#month-filter .dropdown-trigger').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('select').count(),0);checks.push('custom dropdown keyboard operation and no native selects');
  await page.setViewportSize({width:1512,height:982});await page.locator('[data-action=project]').filter({hasText:'portfolio'}).click();await page.locator('.header h1').filter({hasText:'portfolio'}).waitFor();await page.locator('.tabs [data-action=tab][data-view=journal]').click();await page.locator('.maintenance-tabs').waitFor();assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('maintenanceSelection'),'');assert.equal(await page.locator('.maintenance-detail').count(),0);checks.push('project switching clears selections and resets filters');
  await click('global');await page.locator('.tabs [data-action=tab][data-view=journal]').click();await page.getByRole('heading',{name:'全局维护记录',exact:true}).waitFor();assert.equal(await page.locator('.maintenance-tabs').count(),0);await capture('12-global-history');checks.push('global maintenance stays separate from project decisions');
  const emptyRoot=path.join(temporary,'empty-project');fs.mkdirSync(emptyRoot);const empty=store.register({name:'Empty',root:emptyRoot});
  await page.goto(base+`/#project=${empty.id}&view=journal`);await page.getByRole('heading',{name:'暂无当前架构决定',exact:true}).waitFor();await capture('13-empty');checks.push('empty projects remain usable without scaffolding creation');
  assert.deepEqual(errors,[]);checks.push('no browser runtime errors');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({result:'passed',checks,screenshots},null,2));console.log(JSON.stringify({result:'passed',checks:checks.length,screenshots:screenshots.length,output}));
} catch(error) {await capture('failure').catch(()=>{});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({result:'failed',error:error.stack,checks,screenshots,errors},null,2));throw error;}
finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});}
