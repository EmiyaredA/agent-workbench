import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const folder = path.resolve(process.env.AWB_QA_DIR ?? '.local/ui-acceptance');
const source = process.argv[2] ?? 'docs/ui/reference-workspace.png';
const actual = process.argv[3] ?? path.join(folder,'main.png');
const prefix = process.argv[4] ?? 'comparison';
const image = file => 'data:image/png;base64,'+fs.readFileSync(file).toString('base64');
const executablePath = process.env.AWB_CHROME ?? (!process.env.CI ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome'].find(file => fs.existsSync(file)) : undefined);
const browser = await chromium.launch({headless:true,...(executablePath ? {executablePath}:{})});
try {
  const page = await browser.newPage({viewport:{width:1800,height:730},deviceScaleFactor:1});
  const common = 'body{margin:0;background:#edf1f7;color:#17243c;font:16px system-ui}main{display:flex;gap:20px;padding:16px}h2{font-size:16px;margin:0 0 10px}section{flex:1;min-width:0}img{display:block;width:100%}';
  await page.setContent(`<style>${common}</style><main><section><h2>Selected visual reference</h2><img src="${image(source)}"></section><section><h2>Browser-rendered implementation</h2><img src="${image(actual)}"></section></main>`);
  await page.locator('img').evaluateAll(nodes => Promise.all(nodes.map(node => node.decode())));
  await page.screenshot({path:path.join(folder,prefix+'.png')});
  await page.setViewportSize({width:1280,height:520});
  await page.setContent(`<style>${common}main{gap:20px}.crop{width:600px;height:450px;overflow:hidden;position:relative;background:white}.crop img{position:absolute;left:-480px;top:-210px;width:1440px;height:1024px;max-width:none}</style><main><section><h2>Reference · document region, normalized 1440×1024</h2><div class="crop"><img src="${image(source)}"></div></section><section><h2>Implementation · same region and scale</h2><div class="crop"><img src="${image(actual)}"></div></section></main>`);
  await page.locator('img').evaluateAll(nodes => Promise.all(nodes.map(node => node.decode())));
  await page.screenshot({path:path.join(folder,prefix+'-detail.png')});
  console.log('Saved full-view and focused comparison evidence in '+folder);
} finally { await browser.close(); }
