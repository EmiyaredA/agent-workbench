import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { architectureXML } from './architecture.mjs';
import { Fault } from './store.mjs';

// Only the known inert data envelope is read. Imported HTML is never executed.
export function legacyArchitecture(service,id,file) {
  const absolute=service.store.safe(service.project(id),file,false);
  if (fs.statSync(absolute).size>12_000_000) throw new Fault('旧架构 HTML 超过 12 MB');
  const html=fs.readFileSync(absolute,'utf8');
  const envelope=html.match(/<script id="architecture-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!envelope) throw new Fault('未找到支持的工坊架构数据');
  const packed=JSON.parse(envelope[1]);
  const old=JSON.parse(gunzipSync(Buffer.from(packed.data,'base64'),{maxOutputLength:64_000_000}));
  if (!Array.isArray(old.nodes) || !old.deep || !old.sources) throw new Fault('旧架构数据格式不支持');
  const safeId=value=>String(value).replace(/[^\w.-]/g,'-').slice(0,100);
  const refs=(keys,fallback=[])=>{
    const snippets=[];
    const candidates=[...new Set([...(keys ?? []),...fallback])];
    const code=candidates.filter(key=>old.sources[key]?.path && !/\.md$/i.test(old.sources[key].path));
    for (const key of code.length ? code : candidates) {
      const ref=old.sources[key]; if (!ref?.path) continue;
      try {
        const source=service.source(id,ref.path); const length=source.content.split('\n').length;
        const start=Math.min(Math.max(1,Number(ref.line)||1),length);
        if (!snippets.some(s=>s.file===ref.path && s.start===start)) snippets.push({file:ref.path,start,end:Math.min(start+17,length),title:ref.path.split('/').pop()});
      } catch { /* Stale/external legacy refs remain described, never read outside the project. */ }
      if (snippets.length===4) break;
    }
    return snippets;
  };
  const graphMap=new Map(),graphs=[];
  const ownerRefs=owner=>[...owner.refs ?? [],...Object.entries(old.sources).filter(([,ref])=>ref.path?.startsWith(owner.repo+'/') && !/\.md$/i.test(ref.path)).map(([key])=>key)];
  const makeItem=(raw,fallback=[])=>({id:safeId(raw.id),title:raw.title || raw.name,description:raw.sub || raw.desc || '',document:raw.detail || raw.desc || raw.sub || raw.title || raw.name,snippets:refs(raw.refs,fallback)});
  for (const owner of old.nodes) for (const [kind,g] of Object.entries(old.deep[owner.id] ?? {})) {
    if (!g.children?.length) continue;
    const graphId=safeId(owner.id+'-'+kind);graphMap.set(owner.id+':'+kind,graphId);
    const nodes=g.children.map(n=>({...makeItem(n,ownerRefs(owner)),document:`## 职责\n\n${n.detail || n.sub || n.title}\n\n## 所属图示\n\n${g.desc || g.title}\n\n## 关联依据\n\n${(n.refs ?? []).map(key=>old.sources[key]).filter(Boolean).slice(0,2).map(ref=>`${ref.path} · L${ref.line}\n\n${(ref.excerpt ?? '').replace(/^\s*\d+\s{2}/gm,'').slice(0,900)}`).join('\n\n') || '迁移自既有架构图。关联代码为所属模块的实现参考，具体职责仍需结合源码核对。'}`,files:[]})).filter((n,i,items)=>items.findIndex(other=>other.id===n.id)===i);
    const edges=(g.edges ?? []).map((e,index)=>{
      const a=nodes.find(n=>n.id===safeId(e.sources?.[0])),b=nodes.find(n=>n.id===safeId(e.targets?.[0]));
      if (!a || !b) return null;
      const title=e.label || `${a.title} → ${b.title}`;
      const snippets=refs(e.refs); const linked=snippets.length ? snippets : (a.snippets.length ? a.snippets : b.snippets).slice(0,2);
      return {id:'edge-'+index,title,description:e.kind || '关系',document:`## 关系说明\n\n${a.title} → ${b.title}：${title}。\n\n${e.detail || '来自既有架构报告。连线含义需结合关联文档和源码核对，未宣称运行验证。'}`,from:a.id,to:b.id,evidence:e.evidence?.length ? 'static':'inferred',snippets:linked,annotations:[{id:'label-'+index,title,description:'关系说明',document:e.detail || title,snippets:linked}]};
    }).filter(Boolean);
    // Legacy reports may have no valid citation. Keep them out of the first version
    // rather than manufacturing a code association.
    const usable=nodes.filter(n=>n.snippets.length); const ids=new Set(usable.map(n=>n.id));
    if (usable.length) graphs.push({id:graphId,title:g.title,kind,direction:g.direction==='RIGHT'?'RIGHT':'DOWN',nodes:usable,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&e.snippets.length)});
  }
  const nodes=old.nodes.map(n=>({...makeItem({...n,title:n.name,detail:`## 职责\n\n${n.desc}\n\n## 输入与输出\n\n${n.input}\n\n${n.output}\n\n## 数据与边界\n\n${n.state}\n\n${n.guard}`},ownerRefs(n)),childGraphId:graphMap.get(n.id+':runtime'),files:[]})).filter(n=>n.snippets.length);
  if (!nodes.length) throw new Fault('旧报告没有可读取的项目内引用');
  const core=nodes.find(n=>n.id==='core');
  const edges=core ? nodes.filter(n=>n!==core).map((n,i)=>({id:'relation-'+i,title:'公开协议',description:'应用通过 Core 使用公共能力',from:n.id,to:core.id,evidence:'inferred',document:`## 公开边界\n\n${n.title} 通过 Core 的公开协议使用公共能力。业务数据保留在所属应用。\n\n本关系迁移自既有报告，需要结合引用核对，不作为运行验证。`,snippets:[...n.snippets,...core.snippets].slice(0,4),annotations:[{id:'public-'+i,title:'公开协议',description:'HTTP / WebSocket',document:'业务归属工坊，公共模型、身份与资源通过 Core 公开 API 使用。',snippets:n.snippets.slice(0,1)}]})) : [];
  graphs.unshift({id:'overview',title:'工坊架构总览',kind:'component',direction:'RIGHT',nodes,edges});
  for (const flow of old.flows ?? []) {
    const owner=old.nodes.find(n=>n.id===flow.owner) ?? old.nodes[0];
    const snippets=refs(flow.refs,ownerRefs(owner)); if (!snippets.length) continue;
    const flowNodes=flow.lanes.map((title,i)=>({id:'lane-'+i,title,description:flow.kind || '业务参与方',document:`## 职责与流程\n\n${flow.desc}\n\n此节点表示流程中的「${title}」。关联片段为此流程的实现参考。`,snippets,files:[]}));
    const flowEdges=flow.steps.map((step,i)=>({id:'step-'+i,title:step.label,description:step.payload,from:'lane-'+step.a,to:'lane-'+step.b,evidence:'inferred',document:`## 传递内容\n\n${step.payload}\n\n## 持久化\n\n${step.store}\n\n## 异常与恢复\n\n${step.recovery}`,snippets,annotations:[{id:'step-label-'+i,title:step.label,description:'步骤说明',document:`${step.label}\n\n${step.payload}\n\n${step.recovery}`,snippets:snippets.slice(0,1)}]}));
    graphs.push({id:'flow-'+safeId(flow.id),title:flow.name,kind:'flow',direction:'RIGHT',nodes:flowNodes,edges:flowEdges});
  }
  // Preserve the source's original baseline in the prose; capture current source
  // separately on import so the two identities cannot be confused.
  const model={title:'工坊架构与数据流',description:`迁移自 ${file}；旧报告基线 ${old.rootCommit ?? '未记录'}。当前引用在导入时重新核对。`,rootGraphId:'overview',graphs};
  for (const g of graphs) for (const n of g.nodes) if (n.childGraphId && !graphs.some(x=>x.id===n.childGraphId)) delete n.childGraphId;
  return architectureXML(model);
}
