import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { noteShape as shape, validNoteDate as validDate, noteFormatErrors } from './note-format.mjs';
import { atomic, exclusive, info } from './io.mjs';
import { categories, markdownLinks } from './maintenance.mjs';

const directory = '.agents/notes';
const manifestFile = `${directory}/archived/manifest.json`;
const seal = value => value === null ? null : 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(message); };
function projectFor(store,id) {
  const project = store.project(id);
  if (project.scope === 'global') fail('决策笔记只属于已登记项目，不写入全局偏好');
  return project;
}
function read(store,project,file) {
  const target = store.safe(project,file,false);
  const stat=info(target); if (!stat) return null;
  if (!stat.isFile() || stat.size > 1_000_000) fail(`文件无法读取或超过1 MB：${file}`);
  const bytes=fs.readFileSync(target); if (bytes.length > 1_000_000) fail(`文件超过1 MB：${file}`);
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
}
function parseManifest(raw) {
  if (raw === null) return {version:1,files:{}};
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) fail('归档 manifest 格式无效');
  for (const [file,hash] of Object.entries(value.files)) {
    const match = shape(`${directory}/${file}`);
    if (!match || match[1] !== 'archived' || !categories.includes(match[2]) || !/^sha256:[a-f0-9]{64}$/.test(hash)) fail('归档 manifest 含无效路径或封印');
  }
  return value;
}
function inventory(store,project) {
  const files = []; let entries = 0;
  function walk(relative,depth) {
    if (depth > 5) fail('决策目录超过扫描深度，未完成校验');
    const absolute = store.safe(project,relative,false);
    if (!info(absolute)) return;
    for (const item of fs.readdirSync(absolute,{withFileTypes:true})) {
      if (++entries > 10000 || files.length >= 1000) fail('决策扫描达到上限，未完成校验');
      const file = `${relative}/${item.name}`;
      if (item.isSymbolicLink()) fail(`决策目录不接受符号链接：${file}`);
      if (item.isDirectory()) walk(file,depth+1);
      else if (/\.md$/i.test(item.name)) files.push(file);
    }
  }
  walk(directory,0); return files;
}
export const noteErrors=(file,content)=>noteFormatErrors(file,content,categories);

export function verifyNote(store,id,file) {
  const errors=[];
  try {
    const project=projectFor(store,id);const content=read(store,project,file);
    if(content===null)return {ok:false,errors:[`${file}: 决策文件不存在`]};
    errors.push(...noteErrors(file,content));
    if(file.startsWith(directory+'/archived/')) {
      const manifest=parseManifest(read(store,project,manifestFile));
      if(manifest.files[file.slice(directory.length+1)]!==seal(content))errors.push(`${file}: 缺少封印或哈希不符`);
    } else for(const target of markdownLinks(content,file)) {
      try {if(read(store,project,target)===null)errors.push(`${file}: 链接目标不存在 ${target}`);}catch(error){errors.push(`${file}: ${error.message}`);}
    }
  } catch(error) {errors.push(`${file}: ${error.message}`);}
  return {ok:errors.length===0,errors};
}

export function verifyNotes(store,id,{baseRef='HEAD'}={}) {
  const project = projectFor(store,id); const files = inventory(store,project); const errors = []; const warnings = [];
  const receipts=path.join(store.dataDir,'note-archives');
  if (info(receipts)) for (const name of fs.readdirSync(receipts)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const receipt=JSON.parse(fs.readFileSync(path.join(receipts,name),'utf8'));
    if (receipt.plan?.projectId === id && !receipt.complete) errors.push(`归档尚未完成，请用原计划恢复：${name}`);
  }
  const manifest = parseManifest(read(store,project,manifestFile));
  for (const file of files) {
    // Local instruction files are not decision notes and are never modified here.
    if (/\/(?:AGENTS|CLAUDE)\.md$/.test(file)) continue;
    const content = read(store,project,file); errors.push(...noteErrors(file,content));
    if (file.startsWith(`${directory}/archived/`)) {
      if (manifest.files[file.slice(directory.length+1)] !== seal(content)) errors.push(`${file}: 缺少封印或哈希不符`);
    } else for (const target of markdownLinks(content,file)) {
      try { if (read(store,project,target) === null) errors.push(`${file}: 链接目标不存在 ${target}`); }
      catch(error) { errors.push(`${file}: ${error.message}`); }
    }
  }
  for (const [key,hash] of Object.entries(manifest.files)) if (seal(read(store,project,`${directory}/${key}`)) !== hash) errors.push(`${key}: 封印目标缺失或内容变化`);
  const catalog=store.catalog(id);
  for (const warning of catalog.warnings) errors.push(`登记来源扫描不完整：${warning.message}`);
  for (const doc of catalog.docs) {
    if (doc.file.startsWith(directory+'/')) continue;
    for (const target of markdownLinks(read(store,project,doc.file),doc.file)) if (target.startsWith(directory+'/')) {
      try { if (read(store,project,target) === null) errors.push(`${doc.file}: 决策链接目标不存在 ${target}`); }
      catch(error) { errors.push(`${doc.file}: ${error.message}`); }
    }
  }
  const git = args => execFileSync('git',args,{cwd:project.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  let repo;
  try { repo=git(['rev-parse','--show-toplevel']); } catch { warnings.push('无 Git：仅校验磁盘封印，无法证明历史只增不改'); }
  if (repo) {
    let commit;
    try { commit=git(['rev-parse','--verify',`${baseRef}^{commit}`]); }
    catch { errors.push(`归档历史基线不可解析：${baseRef}`); }
    if (commit) {
      const rel=path.relative(repo,path.join(project.root,manifestFile)).split(path.sep).join('/');
      let baseline;
      try { baseline=git(['show',`${commit}:${rel}`]); } catch { /* no manifest in this baseline */ }
      if (baseline) {
        const old=parseManifest(baseline);
        for (const [key,hash] of Object.entries(old.files)) if (manifest.files[key] !== hash) errors.push(`${key}: 相对 ${baseRef} 修改或移除了封印`);
      } else warnings.push(`基线 ${baseRef} 没有封印清单，尚不能核对历史条目`);
    }
  }
  return {ok:errors.length===0,notes:files.length,errors,warnings};
}

export function planArchive(store,id,{file,successor,date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}) {
  const project = projectFor(store,id); const match = shape(file ?? '');
  if (!match || match[1] !== 'implemented' || !categories.includes(match[2])) fail('只能归档 implemented/六类主题 下的笔记');
  if (!validDate(date)) fail('归档日期无效');
  const source = read(store,project,file);
  if (source === null) fail('待归档笔记不存在');
  const errors = noteErrors(file,source); if (errors.length) fail(errors.join('\n'));
  const target=file.replace('/implemented/','/archived/');
  if (read(store,project,target) !== null) fail('归档目标已存在，不能覆盖');
  let successorContent=null;
  if (successor) {
    const other=shape(successor);
    if (!other || other[1] !== 'implemented' || successor === file) fail('接管者必须为另一篇 implemented 笔记');
    successorContent=read(store,project,successor);
    if (successorContent === null) fail('接管笔记不存在');
    const problems=noteErrors(successor,successorContent); if (problems.length) fail(problems.join('\n'));
  }
  const manifestRaw=read(store,project,manifestFile); const manifest=parseManifest(manifestRaw);
  // Verify all existing seals before extending the archive. Never regenerate broken seals.
  const existing=verifyNotes(store,id);
  if (!existing.ok) fail(existing.errors.join('\n'));
  const changes=[];
  if (successor) {
    const link=path.posix.relative(path.posix.dirname(successor),target);
    const after=markdownLinks(successorContent,successor).includes(target) ? successorContent : `${successorContent.trimEnd()}\n\n[历史快照](${link})\n`;
    changes.push({file:successor,before:successorContent,after});
  }
  const newline=source.includes('\r\n') ? '\r\n' : '\n';
  const archived=source.replace(/^(Status: implemented)\r?\n/m,`$1${newline}Archived: ${date}${newline}`);
  const archivedKey=target.slice(directory.length+1);
  if (manifest.files[archivedKey]) fail('清单已含该目标，不能覆盖封印');
  manifest.files[archivedKey]=seal(archived);
  const nextManifest=JSON.stringify({version:1,files:Object.fromEntries(Object.entries(manifest.files).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n';
  changes.push({file:target,before:null,after:archived},{file:manifestFile,before:manifestRaw,after:nextManifest},{file,before:source,after:null});
  for (const change of changes) {
    if (store.isRule(project,change.file)) fail('决策操作不能写入已登记约束；请走约束提案');
    if (change.after !== null && Buffer.byteLength(change.after,'utf8') > 1_000_000) fail(`归档结果超过1 MB，未写入：${change.file}`);
  }
  // Catalog is bounded by registered sources; missing/partial scans cannot certify link repair.
  const catalog=store.catalog(id); if (catalog.warnings.length) fail('来源扫描不完整，先处理警告再归档');
  const inbound=[];
  for (const doc of catalog.docs) {
    if (doc.file === file || doc.file.startsWith(`${directory}/archived/`)) continue;
    if (markdownLinks(read(store,project,doc.file),doc.file).includes(file)) inbound.push(doc.file);
  }
  return {version:1,projectId:id,root:project.root,file,target,successor:successor ?? null,date,changes,inbound,
    warnings:['仅扫描已登记文档；另查代码注释和其他文档中的旧路径。归档完成后修复入站链接并重新校验。']};
}

export function applyArchive(store,id,plan) {
  const project=projectFor(store,id);
  if (plan?.version !== 1 || plan.projectId !== id || plan.root !== project.root) fail('归档计划与项目不匹配');
  const operationId=seal(JSON.stringify(plan)).slice(7);
  return exclusive(store.dataDir,()=>{
    const receiptFile=path.join(store.dataDir,'note-archives',operationId+'.json');
    let receipt=info(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile,'utf8')) : null;
    if (receipt?.complete) return {ok:true,operationId,replayed:true,inbound:receipt.plan.inbound};
    if (!receipt) {
      const expected=planArchive(store,id,{file:plan.file,successor:plan.successor,date:plan.date});
      if (JSON.stringify(expected) !== JSON.stringify(plan)) fail('归档计划已变化，请重新生成并检查差异');
      receipt={plan:expected,complete:false};
      atomic(receiptFile,JSON.stringify(receipt));
    }
    const changes=receipt.plan.changes;
    // Validate every file before resuming; preserve any third-party edits after interruption.
    for (const change of changes) {
      if (store.isRule(project,change.file)) fail('目标已登记为约束，停止归档');
      const current=read(store,project,change.file);
      if (current !== change.before && current !== change.after) fail(`归档中断后出现外部修改，保留文件并停止：${change.file}`);
    }
    for (const change of changes) {
      const current=read(store,project,change.file); if (current === change.after) continue;
      if (current !== change.before) fail(`归档期间文件变化：${change.file}`);
      const absolute=store.safe(project,change.file,false);
      if (change.after === null) fs.unlinkSync(absolute); else atomic(absolute,change.after);
    }
    receipt.complete=true; atomic(receiptFile,JSON.stringify(receipt));
    return {ok:true,operationId,replayed:false,inbound:plan.inbound,next:'修复入站链接，再运行 notes --action verify；记录归档事实与未决项。'};
  });
}
