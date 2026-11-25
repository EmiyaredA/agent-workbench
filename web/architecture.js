export function architectureBoard({api,showDialog:openDialog,closeDialog,button,icon,esc,markdown,dropdown,toast,reload}) {
  const showDialog=(title,body,submit)=>openDialog(title,body,body.includes('type="submit"') ? {submit} : {});
  const state=new Map(); let current; const views=new Map();
  const attr=(key,value)=>`data-${key}="${esc(value)}"`;
  const btn=(label,name,attributes='',classes='')=>button(label,'architecture-'+name,attributes,classes);
  const endpoint=operation=>`/api/projects/${current.id}/architecture${operation ? '/'+operation:''}`;
  const kinds={component:'组件架构',runtime:'运行架构',dependency:'静态依赖',data:'数据模型',state:'状态流转',deployment:'部署架构',structure:'代码结构',flow:'业务流程'};
  const evidence={static:'静态引用',traced:'调用链依据',inferred:'待核对关系'};
  const date=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  function navigate(values,replace=false) {
    const params=new URLSearchParams(location.hash.slice(1));
    for (const [key,value] of Object.entries(values)) { if (value) params.set(key,value); else params.delete(key); }
    if (replace) { history.replaceState(null,'','#'+params); return reload(); }
    location.hash=params.toString();
  }
  const selected=()=>{
    const g=current.graph;
    for (const n of g.nodes) if (n.id===current.selection) return {...n,type:'node'};
    for (const e of g.edges) { if (e.id===current.selection) return {...e,type:'edge'}; for (const a of e.annotations ?? []) if (a.id===current.selection) return {...a,type:'annotation',edge:e}; }
    return {...g.nodes[0],type:'node'};
  };
  function ancestors(graphId,visited=new Set()) {
    if (visited.has(graphId)) return []; visited.add(graphId);
    for (const graph of current.model.graphs) { const node=graph.nodes.find(n=>n.childGraphId===graphId); if (node) return [...ancestors(graph.id,visited),{graph:graph.id,title:node.title,node:node.id}]; }
    return [];
  }
  function tree() {
    const item=selected(),highlight=new Set([...(item.files ?? []),...item.snippets.map(s=>s.file)]);
    const filter=current.query.toLowerCase(); const files=current.model.inventory.files.filter(f=>!filter || f.toLowerCase().includes(filter));
    const root={dirs:new Map(),files:[]};
    for (const file of files) { let cursor=root; const parts=file.split('/'); for (let i=0;i<parts.length-1;i++) { const name=parts[i]; if(!cursor.dirs.has(name)) cursor.dirs.set(name,{path:parts.slice(0,i+1).join('/'),dirs:new Map(),files:[]}); cursor=cursor.dirs.get(name); } cursor.files.push(file); }
    const render=(node,depth=0)=>[...node.dirs].map(([name,dir])=>{
      const expanded=!!filter || current.expanded.has(dir.path) || [...highlight].some(f=>f.startsWith(dir.path+'/'));
      return `<details class="architecture-folder" data-architecture-folder="${esc(dir.path)}" ${expanded?'open':''}><summary>${icon('caret-right')}${icon('folder')}<span>${esc(name)}</span></summary>${expanded?'<div class="architecture-children">'+render(dir,depth+1)+'</div>':''}</details>`;
    }).join('')+node.files.map(file=>btn(icon('file-code')+`<span>${esc(file.split('/').pop())}</span>`,'file',`${attr('file',file)} title="${esc(file)}"`,highlight.has(file)?'architecture-file active':'architecture-file')).join('');
    return render(root) || '<p class="muted small">没有匹配的文件</p>';
  }
  function graphSVG(graph,{exported=false}={}) {
    const chosen=selected(); const highlight=new Set(chosen.type==='node' ? [chosen.id] : [chosen.from,chosen.to,chosen.edge?.from,chosen.edge?.to]);
    const layout=graph.layout;
    const edges=graph.edges.map(e=>{
      const position=layout.edges.find(p=>p.id===e.id); const active=e.id===chosen.id || chosen.edge?.id===e.id;
      const sections=(position?.sections ?? []).map(s=>[s.startPoint,...s.bendPoints ?? [],s.endPoint]);
      const paths=sections.map(points=>`<path class="architecture-edge ${active?'selected':''}" d="${points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ')}" marker-end="url(#architecture-arrow${active?'-selected':''})"/>${!exported?`<path class="architecture-edge-hit" d="${points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ')}" data-action="architecture-select" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="关系：${esc(e.title)}"/>`:''}`).join('');
      const label=position?.labels?.[0]; if (!label) return paths;
      const annotation=e.annotations?.[0];
      return paths+`<g class="architecture-edge-label ${active?'selected':''}" transform="translate(${label.x},${label.y})" ${!exported?`data-action="architecture-select" data-id="${esc(annotation?.id ?? e.id)}" tabindex="0" role="button" aria-label="说明：${esc(e.title)}"`:''}><rect width="${label.width}" height="26" rx="5"/><text x="${label.width/2}" y="17" text-anchor="middle">${esc(e.title)}</text></g>`;
    }).join('');
    const nodes=graph.nodes.map(n=>{
      const p=layout.nodes.find(p=>p.id===n.id); const active=chosen.id===n.id; const related=highlight.has(n.id);
      const chunks=Array.from(n.description || ''); const lines=[chunks.slice(0,16).join(''),chunks.slice(16,32).join('')+(chunks.length>32?'…':'')].filter(Boolean);
      return `<g class="architecture-node ${active?'selected':''} ${related?'related':''}" transform="translate(${p.x},${p.y})" ${!exported?`data-action="architecture-select" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="节点：${esc(n.title)}${n.childGraphId?'，包含子图':''}" aria-pressed="${active}"`:''}><rect width="${p.width}" height="${p.height}" rx="12"/><title>${esc(n.title+'：'+n.description)}</title><text class="architecture-node-title" x="${p.width/2}" y="30" text-anchor="middle">${esc(n.title.length>17?n.title.slice(0,16)+'…':n.title)}</text>${lines.map((line,i)=>`<text class="architecture-node-description" x="${p.width/2}" y="${53+i*18}" text-anchor="middle">${esc(line)}</text>`).join('')}${n.childGraphId ? (exported ? `<text class="architecture-child-symbol" x="${p.width-12}" y="20" text-anchor="end">子图</text>` : `<foreignObject x="${p.width-32}" y="10" width="22" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="architecture-child-indicator">${icon('stack')}</div></foreignObject>`) : ''}</g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" class="architecture-svg" viewBox="-24 -24 ${layout.width+48} ${layout.height+48}" aria-label="${esc(graph.title)}" role="group"><defs><marker id="architecture-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#918781"/></marker><marker id="architecture-arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#a0443e"/></marker></defs>${edges}${nodes}</svg>`;
  }
  function inspector() {
    const item=selected(); const type={node:'节点文档',edge:'关系文档',annotation:'说明文档'}[item.type];
    return `<div class="architecture-document-heading"><div><span class="architecture-kind">${type}</span><h2>${esc(item.title)}</h2></div>${item.childGraphId?btn('进入子图 '+icon('arrow-up-right'),'enter',attr('id',item.childGraphId)) : ''}</div>${item.type==='edge'?`<p class="muted small">${esc(evidence[item.evidence])}</p><div class="architecture-annotation-links">${(item.annotations ?? []).map(a=>btn(esc(a.title),'select',attr('id',a.id),'small')).join('')}</div>`:''}${item.type==='annotation'?btn('查看关联连线','select',attr('id',item.edge.id),'text small'):''}<div class="architecture-prose">${markdown(item.document,item.documentFile || '',current.id)}</div><section class="architecture-snippets"><div class="row between"><h3>关联代码片段</h3><span class="muted small">${item.snippets.length} 个片段</span></div><ol class="architecture-code-list">${item.snippets.map((s,index)=>`<li class="architecture-code-block"><div class="architecture-code-header"><div><strong>${icon('file-code')} ${esc(s.title)}</strong><span class="architecture-source-path">${esc(s.file)} · L${s.start}–L${s.end}</span></div>${btn(icon('copy'),'copy',`${attr('index',index)} aria-label="复制代码片段 ${index+1}"`,'icon small ghost')}</div><pre><code>${s.code.split('\n').map((line,i)=>`<span class="architecture-code-line"><span class="architecture-line-number">${s.start+i}</span><span>${esc(line)||' '}</span></span>`).join('')}</code></pre><div class="row between architecture-code-footer"><span class="muted small">${esc(s.language)} · 版本快照</span>${btn('定位源码 '+icon('arrow-up-right'),'source',attr('index',index),'text small')}</div></li>`).join('')}</ol></section>`;
  }
  async function render(id) {
    const params=new URLSearchParams(location.hash.slice(1)),version=params.get('av') || '';
    let data=state.get(id);
    if (!data || data.version!==version || Date.now()-data.loaded>3000) { const response=await api(`/api/projects/${id}/architecture${version?'?version='+encodeURIComponent(version):''}`); data={...response,id,version,loaded:Date.now(),query:data?.query ?? '',expanded:data?.expanded ?? new Set()}; state.set(id,data); }
    current=data;
    const {listing,model}=current;
    const pending=listing.requests.filter(r=>r.status==='pending');
    const heading=`<div class="architecture-page-heading"><h1>架构总览</h1><p>按节点、关系与子图阅读项目结构，文档和源码片段随选中内容联动。</p></div>`;
    const buttons=btn(icon('arrows-clockwise')+' 生成新版本','generate','','primary')+btn(icon('upload-simple')+' 导入版本','import');
    if (!model) return `<section class="architecture-page">${heading}<div class="architecture-empty">${icon('graph')}<h2>为项目建立第一张架构图</h2><p>由 Agent 阅读项目源码并生成，工作台保存图示、说明文档与关联代码。</p><div class="actions">${buttons}</div>${pending.length?`<p class="architecture-pending">${pending.length} 个生成请求等待 Agent 处理 ${btn('查看任务','request',attr('id',pending[0].id),'text small')}</p>`:''}</div></section>`;
    current.graph=model.graphs.find(g=>g.id===params.get('ag')) ?? model.graphs.find(g=>g.id===model.rootGraphId);
    current.selection=params.get('as') || current.graph.nodes[0].id;
    const chain=ancestors(current.graph.id);
    const versionOptions=listing.versions.map((v,i)=>({value:v.id,label:`v${listing.versions.length-i} · ${v.id===listing.current?'当前版本':'候选版本'}`}));
    const viewOptions=model.graphs.map(g=>({value:g.id,label:g.title}));
    return `<section class="architecture-page">${heading}<div class="architecture-toolbar"><div class="row wrap">${dropdown('architecture-version','架构版本',versionOptions,model.id)}<span class="architecture-date">${date(model.createdAt)}</span><span class="pill ${listing.current===model.id?'implemented':'pending'}">${listing.current===model.id?'当前版本':'候选版本'}</span><span class="architecture-source-status" role="status">正在核对源码…</span></div><div class="actions">${buttons}${btn('对比版本','compare','','')}${listing.current!==model.id?btn('采用此版本','adopt','',''):''}${btn(icon('export'),'export','aria-label="导出架构图" title="导出架构图"','icon')}</div></div>${pending.length?`<div class="architecture-pending">待 Agent 生成 · ${esc(pending[0].focus || '更新项目架构')} ${btn('查看生成任务','request',attr('id',pending[0].id),'text small')} ${btn('刷新','refresh','','text small')}</div>`:''}<div class="architecture-workspace"><aside class="architecture-tree"><h2>代码目录 <span>${model.inventory.files.length}</span></h2><label class="architecture-search">${icon('magnifying-glass')}<input id="architecture-file-query" aria-label="搜索代码目录" placeholder="在目录中搜索文件…" value="${esc(current.query)}"></label><nav class="architecture-file-list" aria-label="架构代码目录">${tree()}</nav>${model.inventory.limited?'<p class="muted small">目录达到扫描上限，结果不完整。</p>':''}</aside><section class="architecture-canvas" aria-label="交互架构图"><div class="architecture-canvas-toolbar">${dropdown('architecture-graph','图示视图',viewOptions,current.graph.id)}<span class="architecture-view-kind">${esc(kinds[current.graph.kind] ?? current.graph.kind)}</span></div><nav class="architecture-breadcrumb" aria-label="子图路径">${btn('架构总览','graph',attr('id',model.rootGraphId),'text small')}${chain.map(c=>'<span>/</span>'+btn(esc(c.title),'graph',attr('id',c.graph),'text small')).join('')}${current.graph.id!==model.rootGraphId && chain.at(-1)?.title!==current.graph.title?`<span>/</span><strong>${esc(current.graph.title)}</strong>`:''}${chain.length?btn(icon('arrow-u-up-left')+' 返回上一级','back','','text small'):''}</nav><div class="architecture-viewport">${graphSVG(current.graph)}</div><div class="architecture-canvas-footer"><span>${icon('info')} 选择节点查看文档 · 拖动画布平移</span><div class="architecture-zoom">${btn(icon('minus'),'zoom-out','aria-label="缩小"','icon small ghost')}<span class="architecture-zoom-value">100%</span>${btn(icon('plus'),'zoom-in','aria-label="放大"','icon small ghost')}${btn(icon('corners-out'),'fit','aria-label="适应画布"','icon small ghost')}</div></div></section><aside class="architecture-inspector" aria-label="架构文档与代码片段">${inspector()}</aside></div></section>`;
  }
  function saveView() { const svg=document.querySelector('.architecture-svg'); if (svg && current?.graph) views.set(current.id+'/'+current.model.id+'/'+current.graph.id,svg.getAttribute('viewBox')); }
  function mount() {
    const svg=document.querySelector('.architecture-svg'); if (!svg) return;
    const key=current.id+'/'+current.model.id+'/'+current.graph.id;
    if(views.has(key)) svg.setAttribute('viewBox',views.get(key));
    else {
      const bounds=svg.getBoundingClientRect(),layout=current.graph.layout;
      const scale=Math.min(bounds.width/(layout.width+48),bounds.height/(layout.height+48));
      if(scale<.6){
        const selectedNode=layout.nodes.find(n=>n.id===selected().id) ?? layout.nodes[0];
        const width=bounds.width/.7,height=bounds.height/.7;
        svg.setAttribute('viewBox',[Math.max(-24,selectedNode.x+selectedNode.width/2-width/2),Math.max(-24,selectedNode.y+selectedNode.height/2-height/2),width,height].join(' '));
      }
    }
    updateZoom();
    const box=()=>svg.getAttribute('viewBox').split(' ').map(Number);
    let drag;
    svg.addEventListener('pointerdown',e=>{ if (e.button!==0 || e.target.closest('[data-action]')) return; drag={x:e.clientX,y:e.clientY,box:box()}; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove',e=>{ if(!drag)return; const bounds=svg.getBoundingClientRect(),scale=Math.max(drag.box[2]/bounds.width,drag.box[3]/bounds.height); svg.setAttribute('viewBox',[drag.box[0]-(e.clientX-drag.x)*scale,drag.box[1]-(e.clientY-drag.y)*scale,...drag.box.slice(2)].join(' ')); });
    svg.addEventListener('pointerup',()=>{drag=null;saveView();});
    svg.addEventListener('wheel',e=>{ e.preventDefault(); if(e.ctrlKey || e.metaKey)zoom(e.deltaY>0?1.12:.88); else {const b=box();b[0]+=e.deltaX;b[1]+=e.deltaY;svg.setAttribute('viewBox',b.join(' '));saveView();} },{passive:false});
    const modelId=current.model.id,projectId=current.id;
    api(endpoint('status')+'?version='+encodeURIComponent(modelId)).then(result=>{ if(current?.id!==projectId || current?.model?.id!==modelId)return; const node=document.querySelector('.architecture-source-status'); if(node){node.textContent=result.changed.length ? `源码有更新 · ${result.changed.length} 个文件`:'引用文件未变化';node.classList.toggle('changed',!!result.changed.length);node.title=result.changed.join('\n');} }).catch(error=>{const node=document.querySelector('.architecture-source-status');if(node)node.textContent='源码核对失败：'+error.message;});
  }
  function updateZoom(){const svg=document.querySelector('.architecture-svg'),label=document.querySelector('.architecture-zoom-value');if(!svg||!label)return;const b=svg.getAttribute('viewBox').split(' ').map(Number),bounds=svg.getBoundingClientRect();label.textContent=Math.round(Math.min(bounds.width/b[2],bounds.height/b[3])*100)+'%';}
  function zoom(factor) { const svg=document.querySelector('.architecture-svg');if(!svg)return;const b=svg.getAttribute('viewBox').split(' ').map(Number),w=b[2]*factor,h=b[3]*factor;if(w<100 || w>20000)return;svg.setAttribute('viewBox',[b[0]+(b[2]-w)/2,b[1]+(b[3]-h)/2,w,h].join(' '));updateZoom();saveView(); }
  function requestText(request) {
    return `请为已登记项目生成架构版本。\n项目 ID：${current.id}\n请求 ID：${request.id}\n重点：${request.focus || '更新项目组件、数据流与关键子图'}\n\n阅读项目 AGENTS.md 与实际源码。按 skills/agent-workbench/references/architecture.md 和 assets/architecture/version.xml 生成 XML。节点只显示标题和简短描述；节点、连线、说明标签均有文档与一个或多个真实代码片段。子图通过 childGraphId 关联，requestId 填上述请求 ID。使用项目相对路径，不能把静态引用描述成运行验证。\n\n在工作台目录执行：\nnode skills/agent-workbench/scripts/workbench.mjs architecture --project ${current.id} --action verify --input <版本.xml>\nnode skills/agent-workbench/scripts/workbench.mjs architecture --project ${current.id} --action import --input <版本.xml>\n\n导入为候选版本，保留当前版本，由用户在看板采用。`;
  }
  async function showRequest(request) {
    showDialog('生成架构版本',`<p class="muted">将任务交给当前使用的 Agent，完成后回到看板刷新。</p><label class="field"><span>生成任务</span><textarea id="architecture-request-text" rows="12" readonly>${esc(requestText(request))}</textarea></label><div class="modal-actions">${btn('复制任务','copy-request','','primary')}${button('关闭','close')}</div>`,()=>{});
  }
  function download(name,type,content) { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  async function action(target) {
    const name=target.dataset.action.slice(13);
    if(name==='select'){saveView();return navigate({as:target.dataset.id});}
    if(name==='enter' || name==='graph'){saveView();return navigate({ag:target.dataset.id,as:''});}
    if(name==='back'){saveView();const chain=ancestors(current.graph.id);return navigate({ag:chain.at(-1)?.graph || current.model.rootGraphId,as:chain.at(-1)?.node || ''});}
    if(name==='file'){
      const file=target.dataset.file;const candidates=[current.graph,...current.model.graphs.filter(g=>g!==current.graph)];
      for(const g of candidates){const node=g.nodes.find(n=>n.files.includes(file));if(node){saveView();return navigate({ag:g.id,as:node.id});}}
      return toast('此文件尚未关联到架构节点。可在下一版本补充。');
    }
    if(name==='copy') {await navigator.clipboard.writeText(selected().snippets[Number(target.dataset.index)].code);return toast('已复制此代码片段');}
    if(name==='copy-request'){await navigator.clipboard.writeText(document.getElementById('architecture-request-text').value);return toast('已复制生成任务');}
    if(name==='source'){
      const s=selected().snippets[Number(target.dataset.index)];const live=await api(endpoint('source')+`?version=${current.model.id}&file=${encodeURIComponent(s.file)}`);
      showDialog('源码 · '+s.file,`<p class="notice ${live.hash!==live.snapshotHash?'warning':''}">${live.hash===live.snapshotHash?'当前源码与此架构版本一致。':'源码已变化；下方为当前文件，右侧片段仍保留版本快照。'}</p><pre class="architecture-live-source">${live.content.split('\n').map((line,i)=>`<span class="architecture-code-line ${i+1>=s.start&&i+1<=s.end?'highlight':''}" ${i+1===s.start?'id="architecture-live-anchor"':''}><span class="architecture-line-number">${i+1}</span><span>${esc(line)||' '}</span></span>`).join('')}</pre><div class="modal-actions">${button('关闭','close')}</div>`,()=>{});document.getElementById('architecture-live-anchor')?.scrollIntoView({block:'center'});return;
    }
    if(name==='generate'){
      return showDialog('生成架构新版本',`<p class="muted">由现有 Agent 分析源码并生成版本。当前版本会保留。</p><label class="field"><span>本次关注什么？（可选）</span><textarea name="focus" rows="3" maxlength="2000" placeholder="例如：生成流程、模块职责、数据持久化"></textarea></label><div class="modal-actions">${button('取消','close')}<button class="btn primary" type="submit">创建生成任务</button></div>`,async input=>{const request=await api(endpoint('request'),{focus:input.focus});state.delete(current.id);closeDialog();await reload();showRequest(request);});
    }
    if(name==='request'){const request=current.listing.requests.find(r=>r.id===target.dataset.id);if(request)return showRequest(request);}
    if(name==='refresh'){state.delete(current.id);return reload();}
    if(name==='import'){
      showDialog('导入架构版本',`<p class="muted">选择 Agent 生成的 XML。导入时验证文档、子图引用、代码路径与行号，并保存源码快照。</p><label class="field"><span>架构 XML 文件</span><input type="file" name="architectureFile" accept=".xml,application/xml,text/xml" required></label><div class="modal-actions">${button('取消','close')}<button class="btn primary" type="submit">校验并导入</button></div>`,async(_input,form)=>{const file=form.elements.architectureFile.files[0];if(!file || file.size>12_000_000)throw Error('请选择不超过 12 MB 的 XML 文件');const result=await api(endpoint('import'),{xml:await file.text()});state.delete(current.id);closeDialog();navigate({av:result.id,ag:'',as:''});toast('版本已导入，核对后可采用');});return;
    }
    if(name==='adopt'){
      showDialog('采用此架构版本',`<p>将「${esc(current.model.title)}」设为当前架构版本，原版本保留在历史中。</p><p class="muted small">采用会追加一条维护记录；架构说明不会自动变成项目约束。</p><div class="modal-actions">${button('取消','close')}<button class="btn primary" type="submit">确认采用</button></div>`,async()=>{await api(endpoint('adopt'),{versionId:current.model.id,expectedCurrent:current.listing.current});state.delete(current.id);closeDialog();await reload();toast('已采用此版本并留档');});return;
    }
    if(name==='compare'){
      if(current.listing.versions.length<2)return toast('至少需要两个版本才能对比');
      const options=current.listing.versions.map((v,i)=>({value:v.id,label:`v${current.listing.versions.length-i} · ${date(v.createdAt)}`}));
      current.compareLeft=current.listing.current && current.listing.current!==current.model.id?current.listing.current:current.listing.versions.find(v=>v.id!==current.model.id).id;current.compareRight=current.model.id;
      showDialog('对比架构版本',`<div class="architecture-compare-controls">${dropdown('architecture-compare-left','基线版本',options,current.compareLeft)}<span>→</span>${dropdown('architecture-compare-right','目标版本',options,current.compareRight)}</div><div id="architecture-compare-result" aria-live="polite">正在对比…</div><div class="modal-actions">${button('关闭','close')}</div>`,()=>{});return compare();
    }
    if(name==='export'){
      showDialog('导出架构版本',`<p class="muted">SVG 导出当前图；HTML 包含版本中全部图、说明文档和代码快照，可离线阅读。</p><div class="actions">${btn('导出 SVG','export-svg','','primary')}${btn('导出离线 HTML','export-html')}</div><div class="modal-actions">${button('关闭','close')}</div>`,()=>{});return;
    }
    if(name==='export-svg'){
      const svg=graphSVG(current.graph,{exported:true}).replace('<defs>','<style>'+exportStyle+'</style><defs>');return download(current.graph.id+'.svg','image/svg+xml',svg);
    }
    if(name==='export-html'){
      const sections=current.model.graphs.map(g=>`<section><h2>${esc(g.title)}</h2>${graphSVG(g,{exported:true})}${[...g.nodes,...g.edges,...g.edges.flatMap(e=>e.annotations ?? [])].map(n=>`<article><h3>${esc(n.title)}</h3><pre class="document">${esc(n.document)}</pre>${n.snippets.map(s=>`<h4>${esc(s.file)} · L${s.start}–L${s.end}</h4><pre>${esc(s.code)}</pre>`).join('')}</article>`).join('')}</section>`).join('');
      return download('architecture-'+current.model.id+'.html','text/html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(current.model.title)+'</title><style>body{font:15px/1.7 system-ui;color:#292627;max-width:1100px;margin:40px auto;padding:20px}svg{width:100%;max-height:720px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f5f2;padding:18px;border-radius:8px}article{border-bottom:1px solid #e9e4e0;padding:20px 0}'+exportStyle+'</style><h1>'+esc(current.model.title)+'</h1><p>'+esc(current.model.description)+'</p><p>版本 '+esc(current.model.id)+' · '+esc(current.model.createdAt)+'</p>'+sections+'</html>');
    }
    if(name==='zoom-in')return zoom(.8);if(name==='zoom-out')return zoom(1.25);if(name==='fit'){views.delete(current.id+'/'+current.model.id+'/'+current.graph.id);const svg=document.querySelector('.architecture-svg');svg.setAttribute('viewBox',`-24 -24 ${current.graph.layout.width+48} ${current.graph.layout.height+48}`);updateZoom();saveView();}
  }
  async function compare(){const result=await api(endpoint('compare')+`?left=${current.compareLeft}&right=${current.compareRight}`);const node=document.getElementById('architecture-compare-result');if(!node)return;node.innerHTML=result.changes.length?`<p class="muted small">${result.changes.length} 项变化 · 对比节点、关系、文档及代码片段</p>${result.changes.map(c=>`<details class="architecture-comparison"><summary><span class="pill">${{added:'新增',removed:'移除',changed:'修改'}[c.type]}</span> ${esc(c.kind)} · ${esc(c.title)}</summary><div class="architecture-comparison-columns"><div><h4>修改前</h4><pre>${esc(JSON.stringify(c.before ?? null,null,2))}</pre></div><div><h4>修改后</h4><pre>${esc(JSON.stringify(c.after ?? null,null,2))}</pre></div></div></details>`).join('')}`:'<p>两个版本的图示内容一致。</p>';}
  async function choose(id,value){if(id==='architecture-version'){saveView();return navigate({av:value,ag:'',as:''});}if(id==='architecture-graph'){saveView();return navigate({ag:value,as:''});}if(id==='architecture-compare-left')current.compareLeft=value;if(id==='architecture-compare-right')current.compareRight=value;return compare();}
  document.addEventListener('input',e=>{if(e.target.id!=='architecture-file-query')return;current.query=e.target.value;document.querySelector('.architecture-file-list').innerHTML=tree();});
  document.addEventListener('toggle',e=>{const path=e.target.dataset?.architectureFolder;if(!path || !current)return;if(e.target.open){current.expanded.add(path);if(!e.target.querySelector('.architecture-children'))document.querySelector('.architecture-file-list').innerHTML=tree();}else current.expanded.delete(path);},true);
  document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key) && e.target.matches('.architecture-svg [data-action]')){e.preventDefault();action(e.target).catch(error=>toast(error.message,true));}});
  window.addEventListener('resize',updateZoom);
  const exportStyle='.architecture-node rect{fill:#faf8f5;stroke:#a69b94;stroke-width:1.2}.architecture-node.selected rect{fill:#f8eae6;stroke:#a0443e;stroke-width:2}.architecture-node text{font-family:system-ui;fill:#302a29}.architecture-node-title{font-size:17px;font-weight:650}.architecture-node-description{font-size:13px;fill:#797375}.architecture-edge{fill:none;stroke:#918781;stroke-width:1.5}.architecture-edge-label rect{fill:#fffefd;stroke:#e9e4e0}.architecture-edge-label text{font:12px system-ui;fill:#797375}';
  return {render,mount,action,choose};
}
