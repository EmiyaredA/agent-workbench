import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Workbench, Fault } from './store.mjs';
import { seedDemo, demoDirectory } from './demo.mjs';
import { projectLayout } from './layout.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..');
const iconsDirectory = path.dirname(fileURLToPath(import.meta.resolve('@phosphor-icons/web/regular')));
const assets = {
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/maintenance.js': ['web/maintenance.js','text/javascript; charset=utf-8'],
  '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['web/style.css', 'text/css; charset=utf-8'],
  '/vendor/marked.js': [fileURLToPath(import.meta.resolve('marked')), 'text/javascript; charset=utf-8'],
  '/vendor/purify.js': [fileURLToPath(import.meta.resolve('dompurify')), 'text/javascript; charset=utf-8'],
};
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
export function createApp({ demo = false, dataDir = path.join(root,'.runtime',demo ? demoDirectory : 'workbench'), store = new Workbench(dataDir) } = {}) {
  store.recover(); if (demo) seedDemo(store);
  const nonce = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
  try {
    const port = server.address()?.port;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(req.headers.host)) throw new Fault('Host 不匹配', 403);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/api/session') return send(res, 200, { nonce, demo, dataDir: store.dataDir, root, version: '0.1.0', layout: projectLayout });
    if (req.method === 'GET' && pathname === '/api/skill') {
      const allowed = ['SKILL.md','references/decision-notes.md','references/note-operations.md','references/note-sources.md','assets/notes/proposed.md','assets/notes/implemented.md','assets/notes/rejected.md'].map(file=>'skills/agent-workbench/'+file);
      const file = url.searchParams.get('file') ?? allowed[0];
      if (!allowed.includes(file)) throw new Fault('Skill 资源未开放',404);
      return send(res, 200, { file, path: path.join(root,file), content: fs.readFileSync(path.join(root,file),'utf8') });
    }
    let input = {};
    if (req.method !== 'GET') {
      if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-workbench-nonce'] !== nonce) throw new Fault('请从当前看板页面发起操作', 403);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw new Fault('请求内容过长', 413); chunks.push(chunk); }
      try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error(); } catch { throw new Fault('JSON 格式不正确'); }
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      store.load();
      return send(res, 200, { warnings: store.recoveryWarnings, projects: store.registry.projects, global: store.registry.global, proposals: store.proposals().map(({ content, baseContent, ...p }) => p) });
    }
    if (demo && req.method !== 'GET' && (pathname === '/api/projects' || pathname === '/api/global') && (input.root || input.file)) {
      const candidate = path.resolve(input.root ?? input.file); const boundary = path.join(store.dataDir,'demo-projects');
      if (candidate !== boundary && !candidate.startsWith(boundary + path.sep)) throw new Fault('演示模式只接受示例目录；真实项目请使用默认工作区',400);
    }
    if (pathname === '/api/projects/inspect' && req.method === 'POST') return send(res,200,store.inspect(input));
    if (pathname === '/api/projects' && req.method === 'POST') return send(res, 201, store.register(input));
    if (pathname === '/api/global' && req.method === 'POST') { store.setGlobal(input.file); return send(res, 200, { ok: true }); }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(document|journal|maintenance|context|search))?$/);
    if (projectMatch) {
      const [, id, operation] = projectMatch;
      if (!operation && req.method === 'GET') return send(res, 200, store.catalog(id));
      if (!operation && req.method === 'PATCH') return send(res, 200, store.configure(id, input));
      if (!operation && req.method === 'DELETE') { store.remove(id); return send(res, 200, { ok: true }); }
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
        if (operation === 'rebase') return send(res, 201, store.rebase(id));
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
    if (req.method === 'GET' && pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
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
