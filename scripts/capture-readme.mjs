import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../src/server.mjs';

// Capture only fictional demo projects in a fresh workspace and browser profile.
const temporary = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'awb-readme-'));
const output = path.resolve('docs/images');
const { server, store } = createApp({ demo:true, dataDir:path.join(temporary, 'demo') });
let browser;
try {
  fs.mkdirSync(output, { recursive:true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.AWB_CHROME ?? (!process.env.CI ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(file => fs.existsSync(file)) : undefined);
  browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport:{ width:1512, height:982 }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const project = store.registry.projects.find(item => item.name === 'agent-workbench');
  const capture = async (name, params, ready) => {
    await page.goto(base + '/#' + new URLSearchParams({ project:project.id, ...params }));
    await page.locator(ready).first().waitFor({ state:'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path:path.join(output, name + '.jpg'), type:'jpeg', quality:88, fullPage:false, animations:'disabled', style:'#toast { visibility:hidden }' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflows');
    console.log('Captured ' + name);
  };
  const rules = { view:'rules', file:'.agent-workbench/rules/index.md' };
  await capture('rules', rules, '.reader h1');
  await capture('changes', { view:'proposals', proposal:'' }, '.change-card');
  const proposal = store.proposals().find(item => item.projectId === project.id && item.title === '使用系统字体减少运行依赖');
  await capture('review', { view:'proposals', proposal:proposal.id }, '.change-detail .diff-grid');
  await capture('decisions', { view:'journal', maintenanceView:'baseline' }, '.decision-card');
  await capture('decision-detail', { view:'journal', maintenanceView:'baseline', maintenanceSelection:'note:.agents/notes/implemented/architecture/2026-11-24-file-first.md' }, '.maintenance-detail h1');
  await capture('pitfalls', { view:'journal', maintenanceView:'pitfalls', maintenanceSelection:'' }, '.pitfall-card');
  await capture('skill', { view:'connect' }, '.skill-content h1');
  await page.setViewportSize({ width:390, height:844 });
  await capture('mobile', { view:'journal', maintenanceView:'baseline', maintenanceSelection:'' }, '.decision-card');
  assert.deepEqual(errors, []);
  console.log('README screenshots ready: 8 images; no browser runtime errors.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporary, { recursive:true, force:true });
}
