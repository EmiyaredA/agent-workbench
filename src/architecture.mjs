import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import ELK from 'elkjs/lib/elk.bundled.js';
import { atomic, exclusive } from './io.mjs';
import { Fault } from './store.mjs';

const directory = '.agent-workbench/architecture';
const digest = text => createHash('sha256').update(text).digest('hex');
const readJSON = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : fallback;
const array = value => value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'string' ? value : value === undefined ? '' : String(value);
const identifier = value => typeof value === 'string' && /^[\w.-]{1,120}$/.test(value);
const git = (root,args) => { try { return execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:5000,maxBuffer:2_000_000,stdio:['ignore','pipe','ignore']}).trim(); } catch { return ''; } };
const codeExtensions = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|c|cc|cpp|h|cs|rb|php|swift|sh|sql|vue|svelte|css|html|toml|ya?ml|json|md|xml)$/i;
const excluded = new Set(['.git','node_modules','.runtime','.local','.venv','venv','dist','build','coverage','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','.testwithproof','.aws','.ssh','.next','.agent-workbench']);
const xmlEscape = value => text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const cdata = value => '<![CDATA['+text(value).replaceAll(']]>',']]]]><![CDATA[>')+']]>';
const field = (name,value) => `<${name}>${xmlEscape(value)}</${name}>`;

export function parseArchitectureXML(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml)>12_000_000) throw new Fault('架构 XML 不能超过 12 MB');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Fault('架构 XML 不接受 DTD 或自定义实体');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Fault('架构 XML 格式错误：'+valid.err.msg);
  const parsed = new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false,processEntities:true,allowBooleanAttributes:false}).parse(xml);
  if (Object.keys(parsed).some(key=>!['architecture','?xml'].includes(key)) || !parsed.architecture || typeof parsed.architecture!=='object') throw new Fault('需要 <architecture> 根标签');
  const root=parsed.architecture;
  const snippets = element => array(element.snippets?.snippet).map(s=>({file:text(s.file).trim(),start:Number(s.start),end:Number(s.end),title:text(s.title).trim()}));
  const item = value => ({id:text(value.id).trim(),title:text(value.title).trim(),description:text(value.description).trim(),document:text(value.document),documentFile:text(value.documentFile).trim(),snippets:snippets(value)});
  return {title:text(root.title).trim(),description:text(root.description).trim(),requestId:text(root.requestId).trim(),rootGraphId:text(root.rootGraphId).trim(),graphs:array(root.graphs?.graph).map(g=>({id:text(g.id).trim(),title:text(g.title).trim(),kind:text(g.kind).trim() || 'component',direction:text(g.direction).trim() || 'DOWN',nodes:array(g.nodes?.node).map(n=>({...item(n),childGraphId:text(n.childGraphId).trim(),files:array(n.files?.file).map(f=>text(f).trim())})),edges:array(g.edges?.edge).map(e=>({...item(e),from:text(e.from).trim(),to:text(e.to).trim(),evidence:text(e.evidence).trim() || 'inferred',annotations:array(e.annotations?.annotation).map(item)}))}))};
}

export function architectureXML(model) {
  const shared = item => field('id',item.id)+field('title',item.title)+field('description',item.description)+`<document>${cdata(item.document)}</document><snippets>`+(item.snippets ?? []).map(s=>'<snippet>'+field('title',s.title)+field('file',s.file)+field('start',s.start)+field('end',s.end)+'</snippet>').join('')+'</snippets>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<architecture>'+field('title',model.title)+field('description',model.description)+field('requestId',model.requestId)+field('rootGraphId',model.rootGraphId)+'<graphs>'+model.graphs.map(g=>'<graph>'+field('id',g.id)+field('title',g.title)+field('kind',g.kind)+field('direction',g.direction)+'<nodes>'+g.nodes.map(n=>'<node>'+shared(n)+field('childGraphId',n.childGraphId)+'<files>'+(n.files ?? []).map(f=>field('file',f)).join('')+'</files></node>').join('')+'</nodes><edges>'+g.edges.map(e=>'<edge>'+shared(e)+field('from',e.from)+field('to',e.to)+field('evidence',e.evidence)+'<annotations>'+(e.annotations ?? []).map(a=>'<annotation>'+shared(a)+'</annotation>').join('')+'</annotations></edge>').join('')+'</edges></graph>').join('')+'</graphs></architecture>\n';
}

export class Architecture {
  constructor(store) { this.store=store; }
  project(id) { if (id==='global') throw new Fault('架构仅用于项目',404); return this.store.project(id); }
  file(id,relative) { return this.store.safe(this.project(id),directory+'/'+relative,false); }
  versions(id) { const folder=this.file(id,'versions'); return fs.existsSync(folder) ? fs.readdirSync(folder).filter(name=>identifier(name) && fs.statSync(path.join(folder,name)).isDirectory()).map(name=>readJSON(this.file(id,`versions/${name}/summary.json`),null)).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) : []; }
  list(id) { const current=readJSON(this.file(id,'current.json'),null); const requests=readJSON(this.file(id,'requests.json'),[]); return {current:current?.versionId ?? '',versions:this.versions(id),requests}; }
  read(id,versionId) {
    const listing=this.list(id); const chosen=versionId || listing.current || listing.versions[0]?.id;
    if (!chosen) return {listing,model:null};
    if (!identifier(chosen) || !listing.versions.some(v=>v.id===chosen)) throw new Fault('架构版本不存在',404);
    return {listing,model:readJSON(this.file(id,`versions/${chosen}/model.json`),null)};
  }
  inventory(id) {
    const root=this.project(id).root; const files=[]; let visits=0; let limited=false;
    const walk=(folder,depth=0)=>{
      if (depth>12 || files.length>=12000 || visits>=30000) { limited=true; return; }
      let entries; try { entries=fs.readdirSync(folder,{withFileTypes:true}); } catch { return; }
      for (const e of entries) {
        if (++visits>30000 || files.length>=12000) { limited=true; break; }
        if (e.isSymbolicLink() || excluded.has(e.name) || e.name.startsWith('.env')) continue;
        const full=path.join(folder,e.name);
        if (e.isDirectory()) walk(full,depth+1);
        else if (e.isFile() && codeExtensions.test(e.name) && fs.statSync(full).size<=512_000) files.push(path.relative(root,full).split(path.sep).join('/'));
      }
    };
    walk(root); return {files:files.sort(),limited};
  }
  source(id,file) {
    const absolute=this.store.safe(this.project(id),file,false);
    if (!codeExtensions.test(file) || path.basename(file).startsWith('.env') || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size>512_000) throw new Fault('源码不存在、不支持或超过 512 KB：'+file);
    const content=fs.readFileSync(absolute,'utf8'); if (content.includes('\0')) throw new Fault('不读取二进制源码');
    return {content,hash:digest(content)};
  }
  snapshot(id,files) {
    const project=this.project(id); const repositories=new Map();
    for (const relative of files) {
      let cursor=path.dirname(this.store.safe(project,relative,false));
      while (cursor!==project.root && !fs.existsSync(path.join(cursor,'.git'))) cursor=path.dirname(cursor);
      if (!repositories.has(cursor)) repositories.set(cursor,{path:path.relative(project.root,cursor).split(path.sep).join('/') || '.',commit:git(cursor,['rev-parse','HEAD']),statusHash:digest(git(cursor,['status','--porcelain','--untracked-files=normal']))});
    }
    if (!repositories.size) repositories.set(project.root,{path:'.',commit:git(project.root,['rev-parse','HEAD']),statusHash:digest(git(project.root,['status','--porcelain','--untracked-files=normal']))});
    const hashes=Object.fromEntries([...new Set(files)].sort().map(file=>[file,this.source(id,file).hash]));
    return {capturedAt:new Date().toISOString(),repositories:[...repositories.values()],gitlinks:git(project.root,['submodule','status']),files:hashes};
  }
  status(id,versionId) {
    const {model}=this.read(id,versionId); if (!model) return {changed:[],checkedAt:new Date().toISOString()};
    const changed=[];
    for (const [file,hash] of Object.entries(model.snapshot.files)) { try { if (this.source(id,file).hash!==hash) changed.push(file); } catch { changed.push(file); } }
    return {changed,checkedAt:new Date().toISOString(),snapshotAt:model.snapshot.capturedAt};
  }
  liveSource(id,versionId,file) {
    const {model}=this.read(id,versionId);
    if (!model || !Object.hasOwn(model.snapshot.files,file)) throw new Fault('源码未关联到此版本',404);
    return {file,...this.source(id,file),snapshotHash:model.snapshot.files[file]};
  }
  async prepare(id,input) {
    this.project(id);
    const model=parseArchitectureXML(input);
    if (!model.title || model.title.length>200 || !Array.isArray(model.graphs) || !model.graphs.length || model.graphs.length>150) throw new Fault('请提供标题与 1–150 个图');
    const graphIds=new Set(); let count=0; const sources=new Set();
    for (const g of model.graphs) {
      if (!identifier(g.id) || graphIds.has(g.id) || !g.title || !['DOWN','RIGHT'].includes(g.direction ?? 'DOWN') || !Array.isArray(g.nodes) || !g.nodes.length || g.nodes.length>200 || !Array.isArray(g.edges) || g.edges.length>500) throw new Fault('图 ID、方向或节点/连线数量无效');
      graphIds.add(g.id); const ids=new Set();
      const hydrate=(item)=>{
        if (++count>10000 || !identifier(item.id) || ids.has(item.id) || !item.title || item.title.length>200 || (item.description?.length ?? 0)>500) throw new Fault('节点/连线/注释 ID 重复或内容过长');
        ids.add(item.id);
        if (item.documentFile) item.document=this.source(id,item.documentFile).content;
        if (!item.document?.trim() || item.document.length>100_000) throw new Fault('每个节点、连线和注释均需要文档：'+item.title);
        if (!Array.isArray(item.snippets) || !item.snippets.length || item.snippets.length>20) throw new Fault('每个节点、连线和注释需要 1–20 个关联代码片段：'+item.title);
        item.snippets=item.snippets.map((s,index)=>{
          if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start<1 || s.end<s.start || s.end-s.start>=200) throw new Fault('代码片段行号无效（每段最多 200 行）');
          const source=this.source(id,s.file); const lines=source.content.split('\n');
          if (s.end>lines.length) throw new Fault('代码片段行号超出源码：'+s.file);
          sources.add(s.file);
          return {...s,id:item.id+'-'+index,title:s.title || path.basename(s.file),language:({py:'python',js:'javascript',mjs:'javascript',ts:'typescript',tsx:'tsx',md:'markdown'}[s.file.split('.').pop()] ?? s.file.split('.').pop()),hash:source.hash,code:lines.slice(s.start-1,s.end).join('\n')};
        });
        if (item.documentFile) sources.add(item.documentFile);
      };
      for (const n of g.nodes) { hydrate(n); n.files=[...new Set([...(n.files ?? []),...n.snippets.map(s=>s.file)])]; for (const file of n.files) { this.source(id,file); sources.add(file); } }
      const nodeIds=new Set(g.nodes.map(n=>n.id));
      for (const e of g.edges) {
        hydrate(e);
        if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || !['static','traced','inferred'].includes(e.evidence)) throw new Fault('连线端点或依据类型无效：'+e.title);
        for (const a of e.annotations ?? []) hydrate(a);
      }
    }
    model.rootGraphId ||= model.graphs[0].id;
    if (!graphIds.has(model.rootGraphId)) throw new Fault('根图不存在');
    const visits=new Set(),active=new Set();
    const visit=id=>{ if (active.has(id)) throw new Fault('子图引用不能形成循环'); if (visits.has(id)) return; active.add(id); for (const n of model.graphs.find(g=>g.id===id).nodes) if (n.childGraphId) { if (!graphIds.has(n.childGraphId)) throw new Fault('子图不存在：'+n.childGraphId); visit(n.childGraphId); } active.delete(id); visits.add(id); };
    for (const id of graphIds) visit(id);
    model.snapshot=this.snapshot(id,[...sources]);
    model.inventory=this.inventory(id);
    const elk=new ELK();
    for (const g of model.graphs) {
      const layout=await elk.layout({id:g.id,layoutOptions:{'elk.algorithm':'layered','elk.direction':g.direction ?? 'DOWN','elk.spacing.nodeNode':'24','elk.layered.spacing.nodeNodeBetweenLayers':'32','elk.layered.spacing.edgeNodeBetweenLayers':'8','elk.edgeRouting':'ORTHOGONAL'},children:g.nodes.map(n=>({id:n.id,width:g.edges.some(e=>e.from===n.id)?330:274,height:96})),edges:g.edges.map(e=>({id:e.id,sources:[e.from],targets:[e.to],labels:[{text:e.title,width:Math.min(190,e.title.length*13+16),height:22}]}))});
      g.layout={width:layout.width,height:layout.height,nodes:layout.children.map(({id,x,y,width,height})=>({id,x,y,width,height})),edges:layout.edges.map(({id,sections,labels})=>({id,sections,labels}))};
    }
    return model;
  }
  async import(id,xml) {
    const model=await this.prepare(id,xml);
    return exclusive(this.store.dataDir,()=>{
      // Resolve the registered root again after asynchronous layout.
      this.project(id);
      if (this.statusFromSnapshot(id,model.snapshot).length) throw new Fault('布局生成期间源码变化，请重新导入',409);
      const versionId=randomUUID(); model.id=versionId; model.schemaVersion=1; model.createdAt=new Date().toISOString();
      const summary={id:versionId,title:model.title,createdAt:model.createdAt,graphs:model.graphs.length,nodes:model.graphs.reduce((n,g)=>n+g.nodes.length,0),requestId:model.requestId || ''};
      atomic(this.file(id,`versions/${versionId}/source.xml`),typeof xml==='string' ? xml : architectureXML(model));
      atomic(this.file(id,`versions/${versionId}/model.json`),JSON.stringify(model));
      // Summary is the commit marker: incomplete imports are not listed.
      atomic(this.file(id,`versions/${versionId}/summary.json`),JSON.stringify(summary,null,2));
      const requests=readJSON(this.file(id,'requests.json'),[]);
      const request=requests.find(r=>r.id===model.requestId);
      if (request) { request.versionId=versionId; request.status='generated'; atomic(this.file(id,'requests.json'),JSON.stringify(requests,null,2)); }
      return summary;
    });
  }
  statusFromSnapshot(id,snapshot) { return Object.entries(snapshot.files).filter(([file,hash])=>{try{return this.source(id,file).hash!==hash;}catch{return true;}}).map(([file])=>file); }
  adopt(id,{versionId,expectedCurrent=''}) {
    const run=()=>{
      const {listing,model}=this.read(id,versionId);
      if (listing.current!==expectedCurrent && listing.current!==versionId) throw new Fault('当前版本已变化，请刷新后核对',409);
      const record=this.store.record(id,{title:'采用架构版本：'+model.title,category:'architecture',background:'在架构看板核对并采用生成的版本。',result:`架构版本 ${versionId}，${model.graphs.length} 个图。`,verification:'已验证导入结构与源码引用；架构描述不代表运行测试通过。',operationId:'architecture-'+versionId});
      atomic(this.file(id,'current.json'),JSON.stringify({versionId,adoptedAt:new Date().toISOString(),record},null,2));
      return {versionId,record};
    };
    return exclusive(this.store.dataDir,()=>{ this.store.load(); this.store.writing=true; try{return run();}finally{this.store.writing=false;} });
  }
  request(id,{focus=''}) {
    this.project(id); if (typeof focus!=='string' || focus.length>2000) throw new Fault('生成重点不能超过 2000 字');
    return exclusive(this.store.dataDir,()=>{
      const request={id:randomUUID(),createdAt:new Date().toISOString(),focus:focus.trim(),status:'pending'};
      const list=readJSON(this.file(id,'requests.json'),[]); list.unshift(request); atomic(this.file(id,'requests.json'),JSON.stringify(list.slice(0,100),null,2));
      return request;
    });
  }
  compare(id,left,right) {
    const a=this.read(id,left).model,b=this.read(id,right).model;
    if (!a || !b) throw new Fault('请选择两个版本');
    const entries=m=>new Map(m.graphs.flatMap(g=>[{key:g.id,kind:'图',title:g.title,value:[g.title,g.kind,g.direction]},...g.nodes.map(n=>({key:g.id+'/node/'+n.id,kind:'节点',title:n.title,value:n})),...g.edges.flatMap(e=>[{key:g.id+'/edge/'+e.id,kind:'连线',title:e.title,value:{...e,annotations:undefined}},...(e.annotations ?? []).map(n=>({key:g.id+'/annotation/'+n.id,kind:'说明',title:n.title,value:n}))])]).map(i=>[i.key,i]));
    const x=entries(a),y=entries(b),changes=[];
    for (const key of new Set([...x.keys(),...y.keys()])) { const before=x.get(key),after=y.get(key); if (JSON.stringify(before?.value)!==JSON.stringify(after?.value)) changes.push({key,kind:(after ?? before).kind,title:(after ?? before).title,type:!before?'added':!after?'removed':'changed',before:before?.value,after:after?.value}); }
    return {left:a.id,right:b.id,changes};
  }
}
