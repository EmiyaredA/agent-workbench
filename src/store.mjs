import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocLineage, queryTerms, matchTerms } from 'mini-trellis-core/mem';
import { diffLines } from 'diff';
import { categories, journalBlocks, journalMetadata, markdownLinks, maintenance } from './maintenance.mjs';
import { atomic, exclusive, info } from './io.mjs';
import { projectLayout, indexFiles } from './layout.mjs';
import { ruleTemplates, stripLegacyDescriptions, indexWithModules } from './rule-templates.mjs';
import { renderJournalEntry, validateJournalAppend } from './journal.mjs';
import { verifyNote } from './notes.mjs';
export { atomic } from './io.mjs';

export class Fault extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const hash = text => text === null ? null : createHash('sha256').update(text).digest('hex');
const now = () => new Date().toISOString();
const short = (value, fallback = '', limit = 500) => String(value ?? fallback).trim().slice(0, limit);
const validateFields = (input, keys) => { for (const key of keys) if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 10_000)) throw new Fault(`${key}格式无效或过长`); };
const projectInput = (input, keys) => { for (const key of Object.keys(input)) if (!keys.includes(key)) throw new Fault(`不支持的项目设置：${key}`); };
const ruleOrder=(a,b)=>{const order=file=>file==='AGENTS.md' ? 0 : file==='.agent-workbench/rules/index.md' ? 1 : 2;return order(a.file)-order(b.file) || a.file.localeCompare(b.file);};
const within = (root, file) => file === root || file.startsWith(root + path.sep);
const exists = file => info(file) !== null;
const readJSON = (file, fallback) => exists(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;

export class Workbench {
  constructor(dataDir, hooks = {}) {
    this.dataDir = path.resolve(dataDir); this.hooks = hooks;
    this.registryFile = path.join(this.dataDir, 'projects.json');
    this.load(); this.recoveryWarnings = [];
  }
  load() {
    const registry = readJSON(this.registryFile, { projects: [], global: null });
    this.registry = { projects: registry.projects.map(({id,name,root,referenceFiles = [],createdAt,demo}) =>
      ({id,name,root,referenceFiles,createdAt,...(demo ? {demo:true} : {})})), global:registry.global };
  }
  saveRegistry() { atomic(this.registryFile, JSON.stringify(this.registry, null, 2)); }
  project(id) {
    if (!this.writing) this.load();
    if (id === 'global' && this.registry.global) return { ...this.registry.global, id, name: '全局偏好', scope: 'global', ruleRoots: [], ruleFiles: [this.registry.global.file] };
    const item = this.registry.projects.find(p => p.id === id);
    if (!item) throw new Fault('项目尚未登记', 404);
    return { ...item, ruleFiles:projectLayout.ruleFiles, ruleRoots:projectLayout.ruleRoots, journalDir:projectLayout.journalDir };
  }
  inspect(input) {
    validateFields(input,['root','name']);
    if (!path.isAbsolute(input.root ?? '')) throw new Fault('请输入已存在目录的绝对路径');
    let root;
    try { root = fs.realpathSync(input.root); if (!fs.statSync(root).isDirectory()) throw Error(); fs.accessSync(root,fs.constants.R_OK); }
    catch { throw new Fault('目录不存在或无法读取'); }
    const duplicate = this.registry.projects.find(p => p.root === root);
    if (duplicate) throw new Fault('这个目录已经登记', 409);
    return { root, discovered: [...projectLayout.ruleFiles,...projectLayout.ruleRoots,projectLayout.journalDir,projectLayout.decisionDir].filter(file => exists(path.join(root,file))) };
  }
  register(input) {
    projectInput(input,['root','name','referenceFiles','demo']);
    const { root } = this.inspect(input);
    const item = { id: randomUUID(), name: short(input.name, path.basename(root), 80) || path.basename(root), root,
      referenceFiles:[], createdAt: now(), ...(input.demo ? { demo: true } : {}) };
    this.references(item,input.referenceFiles);
    this.registry.projects.push(item); this.saveRegistry(); return this.project(item.id);
  }
  references(project, references = project.referenceFiles) {
    if (!Array.isArray(references) || references.length>50) throw new Fault('只读参考文档列表格式不正确');
    for (const file of references) {
      this.safe(project,file);
      if (this.isRule(project,file)) throw new Fault('只读参考文档不能与约束来源重叠');
    }
    project.referenceFiles=[...new Set(references)];
  }
  configure(id, input) {
    projectInput(input,['name','referenceFiles']);
    const project = this.project(id);
    if (id === 'global') throw new Fault('请从全局来源设置修改');
    const item = this.registry.projects.find(p => p.id === id);
    this.references(item,input.referenceFiles);
    item.name = short(input.name, project.name, 80) || project.name;
    this.saveRegistry(); return this.project(id);
  }
  remove(id) {
    this.project(id);
    if (this.proposals().some(p => p.projectId === id && ['pending', 'conflict','recording'].includes(p.status))) throw new Fault('先处理这个项目的待审、冲突或未完成修改', 409);
    this.registry.projects = this.registry.projects.filter(p => p.id !== id); this.saveRegistry();
  }
  setGlobal(file) {
    if (!file) {
      if (this.proposals().some(p => p.projectId === 'global' && ['pending','conflict','recording'].includes(p.status))) throw new Fault('请先处理全局来源的待审、冲突或未完成修改',409);
      this.registry.global = null; this.saveRegistry(); return;
    }
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Fault('请填写全局 Markdown 文件的绝对路径');
    const absolute = path.resolve(file);
    if (!info(absolute)?.isFile() || !/\.md$/i.test(absolute)) throw new Fault('请选择已有的普通 Markdown 文件');
    this.text(absolute);
    this.registry.global = { root: fs.realpathSync(path.dirname(absolute)), file: path.basename(absolute) }; this.saveRegistry();
  }
  safe(project, relative, markdown = true) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(s => !s || ['..', '.', '.git', 'node_modules', '.runtime'].includes(s))) throw new Fault('文件路径不在允许范围');
    if (markdown && !/\.(md|mdx)$/i.test(relative)) throw new Fault('只支持 Markdown 文件');
    const file = path.resolve(project.root, relative);
    try { if (fs.realpathSync(project.root) !== project.root || !fs.statSync(project.root).isDirectory()) throw Error(); }
    catch { throw new Fault('项目目录已移动或发生变化，请重新登记',409); }
    if (!within(project.root, file) || file === project.root) throw new Fault('路径越过项目边界');
    let cursor = project.root;
    for (const part of relative.split('/')) {
      cursor = path.join(cursor, part);
      if (exists(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Fault('首版不经符号链接读写文件');
    }
    return file;
  }
  isRule(project, relative) {
    return typeof relative === 'string' && (project.id === 'global' ? relative === project.file :
      projectLayout.ruleFiles.includes(relative) || projectLayout.ruleRoots.some(root => relative.startsWith(root + '/')));
  }
  target(project, relative) {
    const file = this.safe(project, relative);
    if (!this.isRule(project, relative)) throw new Fault('提案只能修改已登记的约束入口或模块目录');
    if (exists(file) && fs.statSync(file).size > 1_000_000) throw new Fault('文件超过 1 MB，首版不支持修改');
    return file;
  }
  text(file) {
    if (!exists(file)) return null;
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1_000_000) throw new Fault('文件无法读取或超过 1 MB');
    const bytes = fs.readFileSync(file);
    if (bytes.length > 1_000_000) throw new Fault('文件超过 1 MB');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Fault('文件不是有效的 UTF-8 文本'); }
  }
  catalog(id) {
    const project = this.project(id);
    // Registered sources define the read boundary; do not scan all README/docs/research.
    const found = new Set(); const warnings = []; let entries = 0; let limited = false;
    const walk = (relative, depth = 0) => {
      if (depth > 6 || found.size >= 1000 || entries >= 10_000) { limited = true; return; }
      let dir;
      try { dir = this.safe(project, relative, false); } catch { return; }
      if (!info(dir)?.isDirectory()) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (++entries > 10_000) { limited = true; break; }
        if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['node_modules','dist','build','coverage'].includes(entry.name)) continue;
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) walk(child, depth + 1);
        else if (/\.mdx?$/i.test(child)) found.add(child);
        if (found.size >= 1000) break;
      }
    };
    for (const file of project.ruleFiles) if (exists(path.join(project.root,file))) found.add(file);
    for (const file of project.referenceFiles ?? []) if (exists(path.join(project.root,file))) found.add(file);
    if (id !== 'global') for (const dir of [...project.ruleRoots, projectLayout.journalDir, projectLayout.decisionDir,...projectLayout.requirementRoots]) walk(dir);
    if (limited || found.size >= 1000) warnings.push({ message: '固定来源扫描达到数量或深度上限，结果可能不完整' });
    const docs = [];
    for (const file of found) {
      try {
        const content = this.text(this.safe(project, file)); if (content === null) continue;
        const title = content.match(/^#\s+(?:Agent Note[:：]\s*)?(.+)$/m)?.[1] ?? path.basename(file);
        const note = file.match(/^\.agents\/notes\/(proposed|implemented|rejected|archived)\/([^/]+)\//);
        const lineage = parseDocLineage(content, project.root, file);
        const role = projectLayout.requirementRoots.some(root=>file.startsWith(root+'/')) ? 'requirement' : note ? 'decision' : this.isRule(project, file) ? 'rule' : file.startsWith(projectLayout.journalDir + '/') ? 'journal' : 'document';
        docs.push({ file, title, role, scope: project.scope ?? (project.ruleFiles.includes(file) ? 'project' : 'module'),
          status: note?.[1] ?? (lineage.superseded ? 'superseded' : 'current'), category: note?.[2] ?? '',
          date: path.basename(file).match(/^\d{4}-\d{2}(?:-\d{2})?/)?.[0] ?? '', ...lineage });
      } catch (error) { warnings.push({ message: `${file}: ${error.message}` }); }
    }
    docs.sort((a,b) => Number(indexFiles(project).includes(b.file)) - Number(indexFiles(project).includes(a.file)) || a.file.localeCompare(b.file));
    return { project, docs, warnings };
  }
  document(id, file) {
    const { project, docs } = this.catalog(id);
    if (!docs.some(d => d.file === file) && !this.isRule(project, file)) throw new Fault('没有发现这个文档', 404);
    const content = this.text(this.safe(project, file));
    return { file, content: content ?? '', exists: content !== null, hash: hash(content) };
  }
  templates() {
    const dir = path.join(this.dataDir,'templates');
    const personal = exists(dir) ? fs.readdirSync(dir).filter(file => /^[\w-]+\.json$/.test(file)).map(file => readJSON(path.join(dir,file))) : [];
    return [...ruleTemplates,...personal.sort((a,b) => b.createdAt.localeCompare(a.createdAt))].map(({directories,...template})=>({...template,files:template.files.map(({file,content})=>({file,content:file==='.agent-workbench/rules/index.md' ? stripLegacyDescriptions(content) : content}))}));
  }
  constraintPath(file, directory = false) {
    const root=projectLayout.ruleRoots[0];
    const name=directory ? file?.replace(/\/$/,'') : file;
    if (typeof name!=='string' || name.length>220 || (name!=='AGENTS.md' && name!==root && !name.startsWith(root+'/')) || (!directory && !/\.mdx?$/i.test(name)) || (directory && name==='AGENTS.md')) throw new Fault('约束只保存在 AGENTS.md 和固定的 .agent-workbench/rules/ 目录');
    const parts=name.split('/');
    if (parts.some((part,index)=>!part || (index!==0 && part.startsWith('.')) || ['.','..'].includes(part) || /[\\<>`|\r\n]/.test(part)) || parts.length>7) throw new Fault('目录或文件路径无效');
    return directory ? name+'/' : name;
  }
  constraintFiles(input) {
    if (!Array.isArray(input.files) || input.files.length<1 || input.files.length>100) throw new Fault('整套约束需要 1–100 个文件');
    let size=0; const names=new Set();
    const files=input.files.map(item=>{
      if(!item || typeof item!=='object') throw new Fault('文件内容格式无效');
      const file=this.constraintPath(item.file); if(names.has(file)) throw new Fault('文件路径重复：'+file); names.add(file);
      if(typeof item.content!=='string') throw new Fault('请填写有效正文');
      size+=Buffer.byteLength(item.content); return {file,content:file==='.agent-workbench/rules/index.md' ? stripLegacyDescriptions(item.content) : item.content};
    });
    if(size>500_000) throw new Fault('整套约束正文不能超过 500 KB');
    if(!names.has('AGENTS.md') || !names.has('.agent-workbench/rules/index.md')) throw new Fault('请保留项目入口 AGENTS.md 与约束索引 index.md');
    const folded=files.map(item=>item.file.toLowerCase());
    if(new Set(folded).size!==folded.length) throw new Fault('文件路径不能仅大小写不同');
    for(const item of files) if(files.some(parent=>item.file!==parent.file && item.file.toLowerCase().startsWith(parent.file.toLowerCase()+'/'))) throw new Fault('文件不能同时用作目录');
    return {files:files.sort(ruleOrder)};
  }
  constraintSet(id) {
    if(id==='global') throw new Fault('全局偏好使用独立文件，项目约束集仅用于项目');
    const catalog=this.catalog(id); if(catalog.warnings.length) throw new Fault('约束扫描不完整，请先处理来源问题');
    const files=catalog.docs.filter(item=>item.role==='rule').map(item=>{
      const content=this.text(this.target(catalog.project,item.file)); return {file:item.file,content,hash:hash(content)};
    }).sort(ruleOrder);
    return {files:files.map(item=>({...item,content:item.file==='.agent-workbench/rules/index.md' ? stripLegacyDescriptions(item.content) : item.content})),baseHash:hash(JSON.stringify(files.map(item=>[item.file,item.hash])))};
  }
  saveTemplate(input) {
    validateFields(input,['name','description']);
    if(!input.name?.trim() || input.name.length>80) throw new Fault('请填写不超过 80 字的模板名称');
    const tree=this.constraintFiles(input);
    if(this.templates().filter(template=>!template.builtin).length>=100) throw new Fault('个人模板已达到 100 个上限');
    if(this.templates().some(template=>template.name===input.name.trim())) throw new Fault('模板名称已存在，请换一个名称',409);
    const template={id:randomUUID(),builtin:false,name:input.name.trim(),description:short(input.description),...tree,createdAt:now()};
    atomic(path.join(this.dataDir,'templates',template.id+'.json'),JSON.stringify(template,null,2)); return template;
  }
  previewConstraintSet(input) {
    const project=this.project(input.projectId); const current=this.constraintSet(input.projectId);
    if(input.baseHash!==current.baseHash) throw new Fault('项目约束已被外部修改，请重新读取后编辑；草稿仍可复制保留',409);
    const tree=this.constraintFiles(input); const wanted=new Map(tree.files.map(item=>[item.file,item]));
    for(const item of tree.files) if(current.files.some(old=>old.file!==item.file && old.file.toLowerCase()===item.file.toLowerCase())) throw new Fault('请避免仅大小写不同的文件重命名');
    const index=wanted.get('.agent-workbench/rules/index.md'); index.content=indexWithModules(index.content,tree.files);
    const entry=wanted.get('AGENTS.md'); if(!entry.content.includes('.agent-workbench/rules/index.md')) entry.content+='\n按任务读取[约束索引](.agent-workbench/rules/index.md)。\n';
    const all=[...new Set([...current.files.map(item=>item.file),...wanted.keys()])];
    const files=all.map(file=>{const target=this.target(project,file);const baseContent=this.text(target);const content=wanted.get(file)?.content ?? null;return {file,target,baseContent,baseHash:hash(baseContent),content,contentHash:hash(content)};}).filter(item=>item.baseHash!==item.contentHash);
    if(!files.length) throw new Fault('整套约束没有变化');
    const plan={kind:'ruleset',projectId:project.id,file:files[0].file,target:files[0].target,scope:'project',files,title:'更新项目约束',reason:short(input.reason,'整体调整项目约束') || '整体调整项目约束',source:'项目约束整体编辑',category:'process',baseContent:files[0].baseContent,content:files[0].content ?? '',baseHash:current.baseHash,contentHash:hash(JSON.stringify(files.map(item=>[item.file,item.contentHash]))),revision:1,status:'pending',fileChanges:files.map(item=>({...item,changes:diffLines(item.baseContent ?? '',item.content ?? '')}))};
    this.checkChangeRecord({...plan,id:'preview'});return plan;
  }
  saveConstraintSet(input) {
    if(!/^[\w-]{1,64}$/.test(input.operationId ?? '')) throw new Fault('请提供稳定的保存标识');
    const previous=this.proposals().find(item=>item.kind==='ruleset' && item.projectId===input.projectId && item.operationId===input.operationId);
    const requestHash=hash(JSON.stringify(input));
    if(previous){if(previous.requestHash!==requestHash) throw new Fault('保存标识已用于其他内容',409);return this.apply(previous.id,{baseHash:previous.baseHash,contentHash:previous.contentHash});}
    const {fileChanges,...plan}=this.previewConstraintSet(input);
    if(input.reviewHash!==plan.contentHash) throw new Fault('差异已变化，请查看当前整套差异后保存',409);
    const p=this.saveProposal({...plan,id:randomUUID(),operationId:input.operationId,requestHash,createdAt:now(),updatedAt:now()});
    return this.apply(p.id,{baseHash:p.baseHash,contentHash:p.contentHash});
  }
  constraintDiff(p) {
    return p.files.map(item => { let currentContent; let currentError;
      try { const target=this.target(this.project(p.projectId),item.file); if (target!==item.target) throw Error('目标来源已变化'); currentContent=this.text(target); } catch(error) { currentError=error.message; }
      return {...item,currentContent,currentError,changes:diffLines(item.baseContent ?? '',item.content ?? '')};
    });
  }
  writeConstraintFiles(p,receipt) {
    const project = this.project(p.projectId);this.checkChangeRecord(p,receipt.journalFile);
    // Preflight every participant before resuming a partially completed write.
    for (const item of p.files) {
      const target=this.target(project,item.file); const actual=hash(this.text(target));
      if (target!==item.target || (actual!==item.baseHash && actual!==item.contentHash)) {
        p.status='conflict'; p.resolution='整套约束写入曾中断；保留已写入文件及外部修改，请逐文件核对差异。'; this.saveProposal(p);
        atomic(path.join(this.dataDir,'receipts',p.id+'.json'),JSON.stringify({...receipt,state:'interrupted'}));
        throw new Fault(p.resolution,409);
      }
    }
    for (const item of p.files) if (hash(this.text(this.target(project,item.file)))!==item.contentHash) {
      // Repeat the version check immediately before each file write.
      if (hash(this.text(item.target))!==item.baseHash) throw new Fault('文件在写入过程中变化，请重试核对',409);
      if(item.content===null) fs.unlinkSync(item.target); else atomic(item.target,item.content); this.hooks.afterWrite?.(item.file);
    }
    return this.finish(p,receipt);
  }
  proposalFile(id) { if (!/^[\w-]{1,80}$/.test(id)) throw new Fault('提案标识无效'); return path.join(this.dataDir, 'proposals', id + '.json'); }
  proposals() {
    const dir = path.join(this.dataDir, 'proposals');
    if (!exists(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(dir, f))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  proposal(id) { const p = readJSON(this.proposalFile(id)); if (!p) throw new Fault('提案不存在', 404); return p; }
  saveProposal(p) { atomic(this.proposalFile(p.id), JSON.stringify(p, null, 2)); return p; }
  propose(input, direct = false) {
    validateFields(input,['title','reason','source','alternatives','tradeoffs','file']);
    const project = this.project(input.projectId); const file = this.target(project, input.file);
    const baseContent = this.text(file); const content = input.content;
    if (typeof content !== 'string' || Buffer.byteLength(content) > 500_000) throw new Fault('候选内容必须为文本且不超过 500 KB');
    if (content === baseContent) throw new Fault('候选内容与当前文件相同，无需提案');
    if (!short(input.reason) || !short(input.source)) throw new Fault('请填写修改理由和来源');
    if (!categories.includes(input.category)) throw new Fault('请选择有效的迭代标签');
    const proposal={ id: randomUUID(), projectId: project.id, file: input.file, target: file,
      scope: project.scope ?? (project.ruleFiles.includes(input.file) ? 'project' : 'module'),
      title: short(input.title, '更新约束', 120), reason: short(input.reason, '', 4000), source: short(input.source, '', 4000), category:input.category,
      alternatives: short(input.alternatives, '', 4000), tradeoffs: short(input.tradeoffs, '', 4000),
      baseContent, baseHash: hash(baseContent), content, contentHash: hash(content), revision: 1, status: direct ? 'recording' : 'pending', createdAt: now(), updatedAt: now(), ...(direct ? {mode:'direct',operationId:input.operationId,request:input} : {}) };
    this.checkChangeRecord(proposal);return this.saveProposal(proposal);
  }
  writeChange(input) {
    if (!/^[\w-]{1,64}$/.test(input.operationId ?? '')) throw new Fault('直接修改需要稳定的 operationId（1–64位字母、数字、下划线或连字符）');
    const request=Object.fromEntries(['projectId','file','title','reason','source','content','baseHash','operationId','category'].map(key=>[key,input[key]]));
    let p=this.proposals().find(item=>item.mode==='direct' && item.projectId===input.projectId && item.operationId===input.operationId);
    if (p) {
      if (JSON.stringify(p.request)!==JSON.stringify(request)) throw new Fault('同一 operationId 已用于不同的修改',409);
      if (p.status==='recorded') return p;
      if (p.status!=='recording') throw new Fault('这次直接修改已中止，请根据当前文件重新记录',409);
    } else {
      const project=this.project(input.projectId); const target=this.target(project,input.file);
      if (!Object.hasOwn(input,'baseHash') || input.baseHash!==hash(this.text(target))) throw new Fault('原文已变化，请重新读取后修改',409);
      p=this.propose(request,true);
      if (p.baseHash!==request.baseHash) { p.status='conflict'; this.saveProposal(p); throw new Fault('原文在保存前发生变化，未写入',409); }
    }
    const project=this.project(p.projectId); const target=this.target(project,p.file);
    if (target!==p.target) throw new Fault('来源映射已变化，停止直接修改',409);
    const actual=hash(this.text(target));
    const receiptFile=path.join(this.dataDir,'receipts',p.id+'.json');
    let receipt=readJSON(receiptFile);
    if (receipt && actual===p.contentHash) return this.finish(p,receipt);
    if (actual!==p.baseHash) { p.status='conflict'; this.saveProposal(p); throw new Fault('原文已变化，保留外部修改，请重新记录',409); }
    const journalFile=this.journalPath(project);this.checkChangeRecord(p,journalFile);
    receipt={proposalId:p.id,state:'applying',at:now(),project,journalFile};
    atomic(receiptFile,JSON.stringify(receipt));
    atomic(target,p.content); this.hooks.afterWrite?.();
    return this.finish(p,receipt);
  }
  diff(id) {
    const p = this.proposal(id); let currentContent; let currentError;
    try { currentContent = this.text(this.target(this.project(p.projectId),p.file)); } catch(error) { currentError = error.message; }
    const applicationPending = readJSON(path.join(this.dataDir,'receipts',p.id + '.json'))?.state === 'applying';
    return { ...p, currentContent, currentError, applicationPending, ...(p.files ? {fileChanges:this.constraintDiff(p)} : {}), changes: diffLines(p.baseContent ?? '', p.content) };
  }
  ensureNotApplying(id) {
    if (readJSON(path.join(this.dataDir,'receipts',id + '.json'))?.state === 'applying') throw new Fault('已有部分写入，先完成维护记录或重启恢复，不能编辑、拒绝或重提',409);
  }
  revise(id, input) {
    this.ensureNotApplying(id);
    const p = this.proposal(id); if (p.status !== 'pending') throw new Fault('只能编辑待审提案', 409);
    if (p.files) throw new Fault('请在项目约束整体编辑中重新修改',409);
    if (input.contentHash !== p.contentHash) throw new Fault('提案已变化，请刷新后编辑', 409);
    if (typeof input.content !== 'string' || Buffer.byteLength(input.content) > 500_000) throw new Fault('候选内容过长或格式无效');
    p.content = input.content; p.contentHash = hash(p.content); p.revision++; p.updatedAt = now();
    if (input.reason !== undefined) {
      if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 4000) throw new Fault('请填写有效的修改理由');
      p.reason = input.reason.trim();
    }
    const category=input.category ?? p.category;
    if (!categories.includes(category)) throw new Fault('请选择有效的迭代标签'); p.category=category;
    return this.saveProposal(p);
  }
  reject(id, reason) {
    this.ensureNotApplying(id);
    const p = this.proposal(id); if (!['pending', 'conflict'].includes(p.status)) throw new Fault('提案已经处理', 409);
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 4000) throw new Fault('请留下一句拒绝原因，便于后续查阅');
    p.status = 'rejected'; p.rejectionReason = short(reason, '', 4000); p.updatedAt = now(); return this.saveProposal(p);
  }
  rebase(id, input = {}) {
    this.ensureNotApplying(id);
    const old = this.proposal(id); if (!['pending', 'conflict'].includes(old.status)) throw new Fault('这个提案不能重新生成', 409);
    if (old.files) throw new Fault('请在项目约束整体编辑中重新修改',409);
    const target = this.target(this.project(old.projectId),old.file);
    if (target !== old.target) throw new Fault('目标来源已改变，请针对新来源手动创建提案',409);
    if (this.text(target) === old.content) { old.status = 'superseded'; old.resolution = '当前文件已包含全部建议，无剩余差异'; this.saveProposal(old); return { ...old,noChanges:true }; }
    const next = this.propose({...old,category:input.category ?? old.category}); old.status = 'superseded'; old.replacedBy = next.id; old.updatedAt = now(); this.saveProposal(old); return next;
  }
  journalPath(project) {
    return project.id === 'global' ? path.join(this.dataDir, 'global-maintenance.md') : this.safe(project, `${projectLayout.journalDir}/${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).slice(0, 7)}.md`);
  }
  changeRecord(p) {
    return {title:p.title,background:p.reason,result:`${p.mode==='direct' ? '直接修改并记录' : '审核后写入'} ${p.files?.map(item=>item.file).join('、') ?? p.file}。`,alternatives:p.alternatives,tradeoffs:p.tradeoffs,
      verification:`文件内容与${p.mode==='direct' ? '记录' : '审核'}版本 hash 一致；此记录不代表功能测试通过。`,topic:p.file,category:p.category,
      _metadata:{version:1,category:p.category ?? '',...(p.files ? {relatedFiles:p.files.filter(item=>item.content!==null).map(item=>item.file)} : {})}};
  }
  checkChangeRecord(p,file=this.journalPath(this.project(p.projectId))) {
    const project=this.project(p.projectId);const relative=project.id==='global' ? 'global-maintenance.md' : path.relative(project.root,file).split(path.sep).join('/');
    const old=this.text(file) ?? '# 项目维护日志\n';
    if(this.hasJournalRecord(old,relative,p.id))return;
    const section=renderJournalEntry(this.changeRecord(p),p.id,relative,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));
    if(Buffer.byteLength(old+section)>1_000_000)throw new Fault('当月维护文件已超过 1 MB');
    validateJournalAppend(old,section,relative,p.id);this.checkJournalDecisions(project,this.changeRecord(p),section,relative);
  }
  checkJournalDecisions(project,input,section,file) {
    const targets=new Set(markdownLinks(section,file).filter(target=>target.startsWith('.agents/notes/')));
    if(typeof input.topic==='string' && input.topic.startsWith('.agents/notes/'))targets.add(input.topic);
    for(const target of targets){const result=verifyNote(this,project.id,target);if(!result.ok)throw new Fault('关联决策未通过校验：'+result.errors.join('；'));}
  }
  hasJournalRecord(text,file,key) {return journalBlocks({file},text).some(entry=>entry.key===file+':'+key);}
  appendJournal(project, input, key = randomUUID(), file = this.journalPath(project)) {
    if (project.id !== 'global') {
      const relative = path.relative(project.root,file).split(path.sep).join('/');
      if (path.posix.dirname(relative) !== projectLayout.journalDir || !/^\d{4}-\d{2}\.md$/.test(path.posix.basename(relative))) throw new Fault('维护日志只能写入固定的 docs/maintenance/YYYY-MM.md');
      this.safe(project,relative);
    }
    const relative=project.id==='global' ? 'global-maintenance.md' : path.relative(project.root,file).split(path.sep).join('/');
    const old=this.text(file) ?? '# 项目维护日志\n';if(this.hasJournalRecord(old,relative,key))return file;
    const section=renderJournalEntry(input,key,relative,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));
    if(Buffer.byteLength(old+section)>1_000_000)throw new Fault('当月维护文件已超过 1 MB');
    validateJournalAppend(old,section,relative,key);this.checkJournalDecisions(project,input,section,relative);atomic(file,old+section);return file;
  }
  journal(id) {
    const catalog = this.catalog(id); const entries = [];
    for (const d of catalog.docs.filter(d => d.role === 'journal')) {
      const text = this.text(this.safe(catalog.project, d.file)) ?? '';
      entries.push(...journalBlocks(d,text));
    }
    if (id === 'global' && exists(path.join(this.dataDir, 'global-maintenance.md'))) entries.push(...journalBlocks({file:'global-maintenance.md',title:'全局约束变更'},this.text(path.join(this.dataDir,'global-maintenance.md'))));
    return entries.sort((a,b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }
  maintenance(id) {
    if (id === 'global') throw new Fault('维护记录仅用于项目；全局偏好请查看约束与变更记录');
    return maintenance(this,id);
  }
  record(id, input) {
    if (id === 'global') throw new Fault('维护记录仅用于项目；全局偏好请通过约束修改留档');
    const fields = ['title','background','result','alternatives','tradeoffs','verification','next','topic'];
    validateFields(input,[...fields,'category','operationId']);
    if (!short(input.title) || !short(input.background) || !short(input.result)) throw new Fault('请填写标题、背景和实际结果');
    if (input.operationId !== undefined && !/^[\w-]{1,80}$/.test(input.operationId)) throw new Fault('operationId 格式无效');
    if (input.category && !categories.includes(input.category)) throw new Fault('类别无效');
    const project = this.project(id);
    for (const name of ['decisionFiles','relatedFiles']) {
      const values = input[name] ?? [];
      if (!Array.isArray(values) || values.length > 30 || values.some(value => typeof value !== 'string' || !value || value.length > 500 || /[\r\n<>]/.test(value))) throw new Fault(`${name} 格式无效`);
      for (const file of values) this.safe(project,file);
    }
    const payload = Object.fromEntries(fields.map(key => [key,input[key] ?? '']));
    Object.assign(payload,{category:input.category ?? '',decisionFiles:[...new Set(input.decisionFiles ?? [])].sort(),relatedFiles:[...new Set(input.relatedFiles ?? [])].sort()});
    const digest = hash(JSON.stringify(payload));
    if (input.operationId) {
      const catalog = this.catalog(id);
      if (catalog.warnings.length) throw new Fault('来源扫描不完整，不能安全核对重试标识');
      for (const entry of this.journal(id)) {
        const meta = journalMetadata(entry.content);
        if (meta.operationId !== input.operationId) continue;
        if (meta.digest !== digest) throw new Fault('同一 operationId 已用于不同内容',409);
        return {file:entry.file,key:entry.key,replayed:true};
      }
    }
    if (!categories.includes(input.category)) throw new Fault('请选择有效的迭代标签');
    const catalog = this.catalog(id); const known = new Map(catalog.docs.map(doc => [doc.file,doc]));
    for (const file of payload.decisionFiles) if (known.get(file)?.role !== 'decision') throw new Fault('关联决策未找到，请刷新后重新选择');
    for (const file of payload.relatedFiles) if (!known.has(file)) throw new Fault('关联文件未找到或不在登记范围');
    const key = randomUUID();
    const file = this.appendJournal(project,{...payload,_metadata:{version:1,operationId:input.operationId ?? '',digest,category:payload.category,decisionFiles:payload.decisionFiles,relatedFiles:payload.relatedFiles}},key);
    const relative = id === 'global' ? 'global-maintenance.md' : path.relative(project.root,file).split(path.sep).join('/');
    return {file:relative,key:relative+':'+key,replayed:false};
  }
  apply(id, expected) {
    const existing = readJSON(path.join(this.dataDir,'receipts',id + '.json'));
    if (existing?.state === 'applying') this.recoverOne(existing);
    const p = this.proposal(id); if (p.mode==='direct') throw new Fault('直接修改不经过提案批准，请重试原修改记录',409); if (p.status === 'applied') return p;
    if (p.status !== 'pending') throw new Fault('这个提案当前无法批准', 409);
    if (expected.contentHash !== p.contentHash || expected.baseHash !== p.baseHash) throw new Fault('审核版本已经变化，请重新查看差异', 409);
    if (!categories.includes(p.category)) {
      if (!categories.includes(expected.category)) throw new Fault('旧提案缺少迭代标签，请选择标签后再写入');
      p.category=expected.category; this.saveProposal(p);
    } else if (expected.category!==undefined && expected.category!==p.category) throw new Fault('迭代标签已变化，请重新查看',409);
    const project = this.project(p.projectId); let target;
    if (p.files) {
      if (this.constraintDiff(p).some(item => item.currentError || hash(item.currentContent)!==item.baseHash)) { p.status='conflict'; this.saveProposal(p); throw new Fault('项目约束文件已变化，请重新核对差异',409); }
      const journalFile=this.journalPath(project);this.checkChangeRecord(p,journalFile);
      const receipt={proposalId:id,state:'applying',at:now(),project,journalFile};
      atomic(path.join(this.dataDir,'receipts',id+'.json'),JSON.stringify(receipt));
      return this.writeConstraintFiles(p,receipt);
    }
    try { target = this.target(project,p.file); }
    catch { p.status = 'conflict'; this.saveProposal(p); throw new Fault('目标来源已变化，请重新核对文件与来源设置',409); }
    if (target !== p.target || hash(this.text(target)) !== p.baseHash) {
      p.status = 'conflict'; p.updatedAt = now(); this.saveProposal(p); throw new Fault('原文已变化，请重新核对差异', 409);
    }
    const journalFile=this.journalPath(project);this.checkChangeRecord(p,journalFile);
    const receipt = { proposalId: id, state: 'applying', at: now(), project, journalFile };
    const receiptFile = path.join(this.dataDir, 'receipts', id + '.json'); atomic(receiptFile, JSON.stringify(receipt));
    atomic(target, p.content); this.hooks.afterWrite?.();
    return this.finish(p, receipt);
  }
  finish(p, receipt) {
    const project = receipt.project;
    this.appendJournal(project,this.changeRecord(p),p.id,receipt.journalFile);
    p.status = p.mode==='direct' ? 'recorded' : 'applied'; p.updatedAt = now(); this.saveProposal(p);
    atomic(path.join(this.dataDir,'receipts',p.id + '.json'), JSON.stringify({ ...receipt, state: 'complete', completedAt: now(), contentHash: p.contentHash })); return p;
  }
  recoverOne(receipt) {
    const p = this.proposal(receipt.proposalId);
    if (p.files) return this.writeConstraintFiles(p,receipt);
    const target = this.target(this.project(p.projectId),p.file);
    const actual = hash(this.text(target));
    if (target === p.target && actual === p.contentHash) return this.finish(p,receipt);
    p.status = target === p.target && actual === p.baseHash ? (p.mode==='direct' ? 'recording':'pending') : 'conflict'; this.saveProposal(p);
    atomic(path.join(this.dataDir,'receipts',p.id + '.json'),JSON.stringify({ ...receipt,state:'interrupted' })); return p;
  }
  recover() {
    this.recoveryWarnings = [];
    const dir = path.join(this.dataDir, 'receipts'); if (!exists(dir)) return;
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
      const receiptFile = path.join(dir, name); const receipt = readJSON(receiptFile); if (receipt.state !== 'applying') continue;
      try { this.recoverOne(receipt); } catch(error) { this.recoveryWarnings.push(`恢复未完成：${error.message}。修正后可重试批准或重启服务。`); }
    }
  }
  context(id, query = '') {
    const sets = [this.catalog(id)]; if (id !== 'global' && this.registry.global) sets.unshift(this.catalog('global'));
    const rules = []; const indexes = []; const modules = []; const warnings = sets.flatMap(set => set.warnings);
    for (const set of sets) for (const doc of set.docs.filter(d => d.role === 'rule' && !d.superseded)) {
      const entry = { ...doc,projectId:set.project.id };
      if (doc.scope === 'module') {
        modules.push(entry);
        if (indexFiles(set.project).includes(doc.file)) indexes.push({ ...entry,content:this.text(this.safe(set.project,doc.file)) });
      }
      else rules.push({ ...entry,content:this.text(this.safe(set.project,doc.file)) });
    }
    return { rules, indexes, modules: query ? modules.filter(doc => matchTerms(`${doc.title} ${doc.file}`,queryTerms(query)).length) : modules, warnings };
  }
  search(id, query, kind = 'all') {
    if (typeof query !== 'string' || query.length > 200) throw new Fault('搜索词格式无效或过长');
    if (!query.trim()) return { hits:[],warnings:[],truncated:false };
    const terms = queryTerms(query); const catalog = this.catalog(id); const hits = [];
    const add = item => {
      if (!matchTerms(`${item.title} ${item.file ?? ''} ${item.content}`,terms).length) return;
      const index = item.content.toLowerCase().indexOf(query.toLowerCase()); const begin = Math.max(0,index - 40);
      const { content,...metadata } = item; hits.push({ ...metadata,excerpt:content.slice(begin,begin + 180) });
    };
    if (['all','document','journal'].includes(kind)) for (const doc of catalog.docs) {
      if (kind === 'journal' && !['journal','decision'].includes(doc.role)) continue;
      if (kind === 'document' && ['journal','decision'].includes(doc.role)) continue;
      add({ kind:doc.role === 'journal' ? 'journal' : 'document',title:doc.title,file:doc.file,content:this.text(this.safe(catalog.project,doc.file)) ?? '' });
    }
    if (['all','proposal'].includes(kind)) for (const p of this.proposals().filter(p => p.projectId === id)) add({ kind:'proposal',title:p.title,proposalId:p.id,status:p.status,file:p.file,content:`${p.reason}\n${p.source}\n${p.content}` });
    return { hits:hits.slice(0,30),warnings:catalog.warnings,truncated:hits.length > 30 };
  }
}

// All public mutations share a cross-process lock. Read methods never acquire it.
for (const name of ['register','configure','remove','setGlobal','propose','saveConstraintSet','saveTemplate','writeChange','revise','reject','rebase','record','apply','recover']) {
  const operation = Workbench.prototype[name];
  Workbench.prototype[name] = function (...args) {
    if (this.writing) return operation.apply(this,args);
    return exclusive(this.dataDir,() => { this.load(); this.writing = true;
      try { return operation.apply(this,args); } finally { this.writing = false; }
    });
  };
}
