import http from 'node:http';
import { Acceptance } from './acceptance.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Workbench, Fault } from './store.mjs';
import { seedDemo, demoDirectory } from './demo.mjs';
import { projectLayout } from './layout.mjs';
import { Architecture } from './architecture.mjs';
import { composeDefault, detectTemplateContext } from './template-composer.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..');
const iconsDirectory = path.dirname(fileURLToPath(import.meta.resolve('@phosphor-icons/web/regular')));
const assets = {
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/acceptance.js': ['web/acceptance.js','text/javascript; charset=utf-8'],
  '/acceptance.css': ['web/acceptance.css','text/css; charset=utf-8'],
  '/maintenance.js': ['web/maintenance.js','text/javascript; charset=utf-8'],
  '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
  '/rule-modules.js': ['web/rule-modules.js', 'text/javascript; charset=utf-8'],
  '/template-draft.js': ['web/template-draft.js', 'text/javascript; charset=utf-8'],
  '/architecture.js': ['web/architecture.js', 'text/javascript; charset=utf-8'],
  '/architecture.css': ['web/architecture.css', 'text/css; charset=utf-8'],
  '/style.css': ['web/style.css', 'text/css; charset=utf-8'],
  '/theme.css': ['web/theme.css', 'text/css; charset=utf-8'],
  '/assets/kurisu-avatar.png': ['web/assets/kurisu-avatar.png', 'image/png'],
  '/assets/kurisu-favicon-32.png': ['web/assets/kurisu-favicon-32.png', 'image/png'],
  '/assets/kurisu-icon-192.png': ['web/assets/kurisu-icon-192.png', 'image/png'],
  '/assets/kurisu-apple-touch-icon.png': ['web/assets/kurisu-apple-touch-icon.png', 'image/png'],
  '/favicon.ico': ['web/assets/favicon.ico', 'image/x-icon'],
  '/vendor/marked.js': [fileURLToPath(import.meta.resolve('marked')), 'text/javascript; charset=utf-8'],
  '/vendor/purify.js': [fileURLToPath(import.meta.resolve('dompurify')), 'text/javascript; charset=utf-8'],
};
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
export function createApp({ demo = false, dataDir = path.join(root,'.runtime',demo ? demoDirectory : 'workbench'), store = new Workbench(dataDir) } = {}) {
  store.recover(); if (demo) seedDemo(store);
  const architecture=new Architecture(store);
  const acceptance=new Acceptance(store);
  const nonce = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
  try {
    const port = server.address()?.port;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(req.headers.host)) throw new Fault('Host 不匹配', 403);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/api/session') return send(res, 200, { nonce, demo, dataDir: store.dataDir, root, version: '0.1.0', layout: projectLayout });
    if (req.method === 'GET' && pathname === '/api/skill') {
      const allowed = ['SKILL.md','references/acceptance.md','assets/acceptance/requirement.xml','assets/acceptance/run.xml','references/architecture.md','assets/architecture/version.xml','references/maintenance-records.md','assets/maintenance/record.xml','assets/constraints/change.xml','assets/constraints/propose.xml','references/decision-notes.md','references/note-operations.md','assets/notes/proposed.md','assets/notes/implemented.md','assets/notes/rejected.md'].map(file=>'skills/agent-workbench/'+file);
      const file = url.searchParams.get('file') ?? allowed[0];
      if (!allowed.includes(file)) throw new Fault('Skill 资源未开放',404);
      return send(res, 200, { file, path: path.join(root,file), content: fs.readFileSync(path.join(root,file),'utf8') });
    }
    let input = {};
    if (req.method !== 'GET') {
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-workbench-nonce'] !== nonce) throw new Fault('请从当前看板页面发起操作', 403);
      const chunks = []; let size = 0;
      const limit=/^\/api\/projects\/[^/]+\/architecture\/import$/.test(pathname) ? 16_000_000 : 1_000_000;
      for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Fault('请求内容过长', 413); chunks.push(chunk); }
      try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error(); } catch { throw new Fault('JSON 格式不正确'); }
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      store.load();
      return send(res, 200, { warnings: store.recoveryWarnings, projects: store.registry.projects, global: store.registry.global, proposals: store.proposals().map(({ content, baseContent, request, files, ...p }) => ({...p,...(files ? {affectedFiles:files.map(item => item.file)} : {})})) });
    }
    if (demo && req.method !== 'GET' && (pathname === '/api/projects' || pathname === '/api/global') && (input.root || input.file)) {
      const candidate = path.resolve(input.root ?? input.file); const boundary = path.join(store.dataDir,'demo-projects');
      if (candidate !== boundary && !candidate.startsWith(boundary + path.sep)) throw new Fault('演示模式只接受示例目录；真实项目请使用默认工作区',400);
    }
    if (pathname === '/api/projects/inspect' && req.method === 'POST') return send(res,200,store.inspect(input));
    if (pathname === '/api/templates' && req.method === 'GET') return send(res,200,store.templates());
    if (pathname === '/api/templates' && req.method === 'POST') return send(res,201,store.saveTemplate(input));
    const templateMatch=pathname.match(/^\/api\/templates\/([\w-]+)\/compose$/);
    if (templateMatch && req.method==='POST') {
      const template=store.templates().find(item=>item.id===templateMatch[1]);
      if(!template) throw new Fault('模板不存在',404);
      try { return send(res,200,template.id==='default' ? composeDefault(input.selection) : {files:template.files,selection:{}}); }
      catch(error) { throw new Fault(error.message); }
    }
    const templateContextMatch=pathname.match(/^\/api\/projects\/([^/]+)\/template-context$/);
    if(templateContextMatch && req.method==='GET') {
      const project=store.project(templateContextMatch[1]);
      if(project.id==='global') throw new Fault('全局偏好不使用项目模板');
      return send(res,200,detectTemplateContext(project.root));
    }
    if (pathname === '/api/constraints/preview' && req.method === 'POST') return send(res,200,store.previewConstraintSet(input));
    if (pathname === '/api/constraints' && req.method === 'POST') return send(res,201,store.saveConstraintSet(input));
    if (pathname === '/api/projects' && req.method === 'POST') return send(res, 201, store.register(input));
    if (pathname === '/api/global' && req.method === 'POST') { store.setGlobal(input.file); return send(res, 200, { ok: true }); }
    if (pathname === '/api/changes' && req.method === 'POST') return send(res,201,store.writeChange(input));
    const acceptanceMatch=pathname.match(/^\/api\/projects\/([^/]+)\/acceptance(?:\/(evidence))?$/);
    if(acceptanceMatch && req.method==='GET') {
      const [,id,operation]=acceptanceMatch;
      const key=url.searchParams.get('id');
      if(operation==='evidence') {
        const result=acceptance.evidence(id,key,url.searchParams.get('file'));
        res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'");
        res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'no-store'});return res.end(result.data);
      }
      return send(res,200,key?acceptance.read(id,key):acceptance.list(id));
    }
    const architectureMatch=pathname.match(/^\/api\/projects\/([^/]+)\/architecture(?:\/(status|source|import|adopt|request|compare))?$/);
    if (architectureMatch) {
      const [,id,operation]=architectureMatch;
      if (!operation && req.method==='GET') return send(res,200,architecture.read(id,url.searchParams.get('version')));
      if (operation==='status' && req.method==='GET') return send(res,200,architecture.status(id,url.searchParams.get('version')));
      if (operation==='source' && req.method==='GET') return send(res,200,architecture.liveSource(id,url.searchParams.get('version'),url.searchParams.get('file')));
      if (operation==='compare' && req.method==='GET') return send(res,200,architecture.compare(id,url.searchParams.get('left'),url.searchParams.get('right')));
      if (operation==='import' && req.method==='POST') return send(res,201,await architecture.import(id,input.xml));
      if (operation==='adopt' && req.method==='POST') return send(res,200,architecture.adopt(id,input));
      if (operation==='request' && req.method==='POST') return send(res,201,architecture.request(id,input));
    }
    const changeRetry=pathname.match(/^\/api\/changes\/([\w-]+)\/retry$/);
    if (changeRetry && req.method === 'POST') {
      const change=store.proposal(changeRetry[1]);
      if (change.mode!=='direct') throw new Fault('不是直接修改记录');
      return send(res,200,store.writeChange(change.request));
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(document|journal|maintenance|context|search|constraints))?$/);
    if (projectMatch) {
      const [, id, operation] = projectMatch;
      if (!operation && req.method === 'GET') return send(res, 200, store.catalog(id));
      if (!operation && req.method === 'PATCH') return send(res, 200, store.configure(id, input));
      if (!operation && req.method === 'DELETE') { store.remove(id); return send(res, 200, { ok: true }); }
      if (operation === 'constraints' && req.method === 'GET') return send(res,200,store.constraintSet(id));
      if (operation === 'search' && req.method === 'GET') return send(res,200,store.search(id,url.searchParams.get('q') ?? '',url.searchParams.get('kind') ?? 'all'));
      if (operation === 'document' && req.method === 'GET') return send(res, 200, store.document(id, url.searchParams.get('file')));
      if (operation === 'maintenance' && req.method === 'GET') return send(res, 200, store.maintenance(id));
      if (operation === 'journal' && req.method === 'GET') return send(res, 200, store.journal(id));
      if (operation === 'journal' && req.method === 'POST') return send(res, 201, store.record(id, input));
      if (operation === 'context' && req.method === 'GET') return send(res, 200, store.context(id, url.searchParams.get('query') ?? ''));
    }
    if (pathname === '/api/proposals' && req.method === 'POST') return send(res, 201, store.propose(input));
    const proposalMatch = pathname.match(/^\/api\/proposals\/([\w-]+)(?:\/(apply|reject|revise|rebase))?$/);
    if (proposalMatch) {
      const [, id, operation] = proposalMatch;
      if (!operation && req.method === 'GET') return send(res, 200, store.diff(id));
      if (req.method === 'POST') {
        if (operation === 'apply') return send(res, 200, store.apply(id, input));
        if (operation === 'reject') return send(res, 200, store.reject(id, input.reason));
        if (operation === 'revise') return send(res, 200, store.revise(id, input));
        if (operation === 'rebase') return send(res, 201, store.rebase(id,input));
      }
    }
    if (req.method === 'GET' && pathname.startsWith('/icons/')) {
      const name = pathname.slice(7); if (!/^[\w.-]+$/.test(name)) throw new Fault('文件不存在', 404);
      const file = path.join(iconsDirectory,name);
      if (!fs.existsSync(file)) throw new Fault('文件不存在', 404);
      res.writeHead(200, { 'Content-Type': name.endsWith('.css') ? 'text/css' : 'font/woff2' }); return res.end(fs.readFileSync(file));
    }
    if (req.method === 'GET' && assets[pathname]) {
      const [relative, type] = assets[pathname]; res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.isAbsolute(relative) ? relative : path.join(root,relative)));
    }
    throw new Fault('没有这个页面或接口', 404);
  } catch (error) { send(res, error.status ?? 500, { error: error.code && ['EACCES','EPERM'].includes(error.code) ? '文件无法读取或写入，请检查目录权限' : error.message }); }
});
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i+1]; };
  const demo = args.includes('--demo');
  const dataDir = path.resolve(value('--data',process.env.AGENT_WORKBENCH_DATA ?? path.join(root,'.runtime',demo ? demoDirectory : 'workbench')));
  const port = Number(value('--port','4173'));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('端口格式不正确');
  const { server } = createApp({ dataDir,demo });
  server.listen(port,'127.0.0.1',() => console.log(`Agent Workbench http://127.0.0.1:${server.address().port} · ${demo ? 'isolated demo' : 'local files'}`));
  server.on('error',error => { console.error(error.message); process.exitCode = 1; });
}
