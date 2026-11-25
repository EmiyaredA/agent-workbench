import { mergeTemplateDraft, validOptions, changeConfiguration, relocateDraft } from './template-draft.js';

export function ruleModules({api,showDialog,closeDialog,icon,esc,markdown,renderDiff,dropdown,toast,saved}) {
  const moduleRoot='.agent-workbench/rules/';
  const fixed=file=>['AGENTS.md',moduleRoot+'index.md'].includes(file);
  const parent=file=>file.slice(0,file.lastIndexOf('/')+1);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const dialog=()=>document.querySelector('#dialog');
  const folders=files=>[...new Set(files.flatMap(item=>{const parts=item.file.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/')+'/');}))].filter(file=>file.startsWith(moduleRoot));
  const validPart=name=>Boolean(name)&&!name.startsWith('.')&&!/[\/\\<>`|\r\n]/.test(name);
  const collapsed=new Set();
  const folderKey=(id,file)=>JSON.stringify([id,file]);
  let draft,baseline,templates,projectId,selected=0,templateId='',configuration={},context={},generated=[],conflicts=[];
  let tab='content',overlay=null,fileMenu=null,review=null,operationId=null,busy=false,message='',requestVersion=0,epoch=0;
  let draftFolders=new Set(),positions=new Map(),treeScroll=0;
  const current=()=>draft.files[selected];
  const conflict=file=>conflicts.find(item=>item.file===file);
  function ensureEntries(tree){for(const [file,content] of [['AGENTS.md','# 项目约束\n'],[moduleRoot+'index.md','# 约束索引\n']])if(!tree.files.some(item=>item.file===file))tree.files.push({file,content});return tree;}
  function sync(){
    if(!draft)return;
    const body=dialog().querySelector('[name=content]');if(body&&current()){
      current().content=body.value;positions.set(current().file,{editor:body.scrollTop,preview:dialog().querySelector('.set-live-preview')?.scrollTop??0});
    }
    const nav=dialog().querySelector('.set-tree>nav');if(nav)treeScroll=nav.scrollTop;
    const reason=dialog().querySelector('[name=reason]');if(reason)draft.reason=reason.value;
    if(overlay?.kind==='operation'){
      const name=dialog().querySelector('[name=filename]');if(name)overlay.name=name.value;
      const folder=dialog().querySelector('[name=folderName]');if(folder)overlay.folderName=folder.value;
    }
    if(overlay?.kind==='template'){const name=dialog().querySelector('[name=templateName]');if(name)overlay.name=name.value;}
  }
  function invalidate(){review=null;operationId=null;message='';}
  const payload=()=>({projectId,baseHash:baseline.baseHash,files:draft.files,reason:draft.reason??''});
  const template=()=>templates.find(item=>item.id===templateId);
  const templatePicker=()=>dropdown('constraint-template','项目约束模板',[{value:'',label:'当前项目'},...templates.map(item=>({value:item.id,label:item.builtin?item.name:'我的模板 · '+item.name}))],templateId);
  function summary(){
    if(!template())return '当前项目';
    const labels=template().configuration?.groups.flatMap(group=>group.fields.map(field=>field.options.find(option=>option.value===configuration[field.id]))).filter(option=>option&&option.value!=='none').map(option=>option.label)??[];
    return [template().name,...labels].join(' · ');
  }
  function treeMarkup(){
    const fileRow=(item,index)=>`<div class="set-file-row"><button type="button" class="set-file ${index===selected?'active':''}" data-set-file="${index}" aria-current="${index===selected?'true':'false'}"><span class="set-tree-slot" aria-hidden="true"></span>${icon('file-text')}<span class="set-file-text"><strong>${esc(item.file.split('/').pop())}</strong></span>${conflict(item.file)?'<span class="set-conflict-dot" title="此文件有待处理的模板更新" aria-label="待确认"></span>':''}</button><button type="button" class="set-more" data-set-menu="${index}" aria-label="${esc(item.file.split('/').pop())} 更多操作" aria-haspopup="menu">${icon('dots-three')}</button></div>`;
    const paths=folders(draft.files);
    const folder=file=>{
      const title=(file===moduleRoot?'rules':file.slice(0,-1).split('/').pop()).toUpperCase();
      const direct=draft.files.map((item,index)=>({item,index})).filter(({item})=>parent(item.file)===file).map(({item,index})=>fileRow(item,index)).join('');
      const children=paths.filter(child=>child!==file&&parent(child.slice(0,-1))===file).sort().map(folder).join('');
      return `<details class="set-folder" data-constraint-folder="${esc(file)}" data-project="${esc(projectId)}" ${collapsed.has(folderKey(projectId,file))?'':'open'}><summary class="set-folder-row" title="${esc(file)}">${icon('caret-down')}${icon('folder')}<span class="set-folder-heading"><strong>${esc(title)}</strong>${file===moduleRoot?`<small class="set-folder-path">${esc(moduleRoot)}</small>`:''}</span></summary><div class="set-folder-children">${direct}${children}</div></details>`;
    };
    return draft.files.map((item,index)=>({item,index})).filter(({item})=>item.file==='AGENTS.md').map(({item,index})=>fileRow(item,index)).join('')+(paths.includes(moduleRoot)?folder(moduleRoot):'');
  }
  function configurationMarkup(){
    const schema=template()?.configuration;
    if(!schema)return `<p class="set-empty-config">${templateId?'此个人模板保存完整文件快照，可在「目录与内容」中调整。':'选择一个模板以配置技术栈；当前项目文件不会被直接覆盖。'}</p>`;
    const control=(field,group)=>{
      const options=validOptions(field,configuration),label=group.id==='frontend'||group.id==='backend'?group.label+field.label:field.label;
      return `<div class="set-config-field"><span>${esc(field.label)}</span>${options.length===1?`<span class="set-config-fixed">${esc(options[0].label)}</span>`:dropdown('constraint-config-'+field.id,label,options,configuration[field.id])}</div>`;
    };
    return `<section class="set-technology"><div class="set-config-groups">${schema.groups.map(group=>`<section class="set-config-group"><h3>${icon(group.icon)}${esc(group.label)}</h3><div class="set-config-fields">${group.fields.map(field=>control(field,group)).join('')}</div>${group.id==='data'&&configuration.database!=='none'?`<small>数据访问 ${configuration.backendLanguage==='go'?'GORM':'SQLAlchemy'}</small>`:''}</section>`).join('')}</div></section>`;
  }
  function configPanel(){
    const resources=template()?.resources??[];
    return `<section id="set-panel-config" class="set-config-panel" role="tabpanel" aria-labelledby="set-tab-config"><div class="set-config-form"><div class="set-template-control">${icon('stack')}<span>约束模板</span>${templatePicker()}</div>${configurationMarkup()}${templateId==='default'?`<p class="set-template-scope">通用约束默认包含，技术规则随配置匹配。</p><p class="set-detection-note">${context.evidence?.length?'部分配置依据项目清单识别，请确认实际设置。':'未识别项使用模板初值，请按实际情况确认。'} ${esc((context.warnings??[]).join('；'))}</p>`:''}</div><aside class="set-impact"><h3>对应文档</h3>${templateId?`<ul>${generated.filter(item=>item.file!=='AGENTS.md'&&!item.file.endsWith('/index.md')).map(item=>`<li>${esc(item.file.slice(moduleRoot.length))}</li>`).join('')}</ul><p>项目原有说明与手写内容保留。</p>`:'<p>选择模板后查看对应文档。</p>'}${resources.length?`<div class="set-resource-list"><strong>项目文档参考</strong>${resources.map((item,index)=>`<button type="button" class="btn text small" data-set-resource="${index}">${icon('file-text')} ${esc(item.name)}</button>`).join('')}<small>按真实项目填写，不自动创建空文档。</small></div>`:''}${conflicts.length?`<button type="button" class="btn text small set-impact-conflicts" data-set-tab="content">${conflicts.length} 个文件待确认</button>`:''}</aside></section>`;
  }
  function conflictMarkup(){
    const item=conflict(current().file);if(!item)return '';
    return `<section class="set-conflict" aria-label="文件合并冲突"><strong>当前文件有模板更新</strong><details><summary>对比原文与模板</summary><div class="set-conflict-columns"><div><span>当前草稿</span><pre>${esc(current().content)}</pre></div><div><span>模板内容</span><pre>${esc(item.incoming??'（移除此文件）')}</pre></div></div></details><div class="row"><button type="button" class="btn small" data-conflict-choice="current">保留原文</button><button type="button" class="btn small" data-conflict-choice="incoming">采用模板</button><button type="button" class="btn small" data-conflict-choice="merge">编辑合并</button></div></section>`;
  }
  function contentPanel(){
    const item=current();
    return `<section id="set-panel-content" class="set-content-panel" role="tabpanel" aria-labelledby="set-tab-content"><p class="set-context-line">${esc(summary())}</p><div class="set-editor-layout"><aside class="set-tree"><div class="row between"><strong>目录与文件</strong><button type="button" class="btn text small" data-set-add>${icon('plus')} 新增文件</button></div><nav aria-label="编辑约束文件">${treeMarkup()}</nav></aside><section class="set-file-editor"><div class="row between"><strong>${esc(item.file.split('/').pop())}</strong><button type="button" class="btn icon ghost small" data-set-menu="${selected}" aria-label="当前文件更多操作">${icon('dots-three')}</button></div><p class="set-file-path" title="${esc(item.file)}">${esc(item.file)}</p>${conflictMarkup()}<label class="field set-body"><span>Markdown 正文</span><textarea name="content" aria-label="约束正文" spellcheck="false">${esc(item.content)}</textarea></label></section><section class="set-preview-pane"><div class="set-preview-title"><strong>${icon('eye')} 当前文件预览</strong></div><div class="set-live-preview">${markdown(item.content,item.file,projectId)}</div></section></div></section>`;
  }
  function menuMarkup(){
    if(fileMenu===null)return '';
    const item=current(),locked=fixed(item.file)||Boolean(conflict(item.file));
    return `<div class="set-file-menu" role="menu" aria-label="文件操作"><button type="button" role="menuitem" data-file-action="rename" ${locked?'disabled':''}>重命名</button><button type="button" role="menuitem" data-file-action="move" ${locked?'disabled':''}>移动</button><button type="button" role="menuitem" data-file-action="delete" ${locked?'disabled':''}>移除文件</button><button type="button" role="menuitem" data-file-action="copy">复制相对路径</button>${conflict(item.file)?'<small>先处理当前文件的模板更新</small>':''}</div>`;
  }
  function overlayMarkup(){
    if(!overlay)return '';
    let body,title,actions='';
    if(overlay.kind==='review'){
      title=`整套变更 · ${review.fileChanges?.length??review.files.length} 个文件`;
      body=`<label class="field"><span>变更说明（选填）</span><input name="reason" aria-label="变更说明" value="${esc(draft.reason??'')}"></label><div class="set-review">${renderDiff(review)}</div>`;
      actions='<button type="button" class="btn primary" data-set-save>确认保存整套约束</button>';
    }else if(overlay.kind==='template'){
      title='保存为我的模板';body=`<label class="field"><span>模板名称</span><input name="templateName" aria-label="模板名称" maxlength="80" value="${esc(overlay.name??'')}"></label><p class="muted small">保存当前文件快照，不写入项目。</p>`;actions='<button type="button" class="btn primary" data-set-template-confirm>保存模板</button>';
    }else if(overlay.kind==='resource'){
      const item=template().resources[overlay.index];title=item.name+' · 写作参考';body=`<pre class="set-resource-source">${esc(item.content)}</pre>`;actions='<button type="button" class="btn" data-set-resource-copy>复制参考</button>';
    }else{
      const mode=overlay.mode;title=mode==='add'?'新增文件':mode==='rename'?'重命名文件':'移动文件';
      const directories=[...new Set([moduleRoot,...draftFolders,...folders(draft.files)])].sort();
      body=`${mode!=='rename'?`<div class="field"><span>所在目录</span>${dropdown('constraint-directory','所在目录',[...directories.map(value=>({value,label:value===moduleRoot?'RULES':'RULES / '+value.slice(moduleRoot.length,-1)})),{value:'__new',label:'+ 新建子目录'}],overlay.directory)}</div>`:''}${overlay.addingDirectory?`<div class="set-new-directory"><input name="folderName" aria-label="子目录名称" placeholder="子目录名称" value="${esc(overlay.folderName??'')}"><button type="button" class="btn small" data-set-create-directory>创建子目录</button></div>`:''}${mode!=='move'?`<label class="field"><span>文件名</span><input name="filename" aria-label="文件名" value="${esc(overlay.name??'')}" placeholder="例如 架构.md" spellcheck="false"></label>`:`<p class="set-file-path">${esc(overlay.file)}</p>`}`;
      actions='<button type="button" class="btn primary" data-set-operation-confirm>确定</button>';
    }
    return `<div class="set-overlay" role="region" aria-label="${esc(title)}"><div class="set-overlay-head"><h3>${esc(title)}</h3><button type="button" class="btn" data-set-overlay-close>返回编辑</button></div><div class="set-overlay-body">${body}</div><div class="set-overlay-footer"><span class="set-overlay-error" role="alert">${esc(message)}</span>${actions}</div></div>`;
  }
  function render(){
    const body=`<div class="set-editor-main" ${overlay||busy?'inert':''}><div class="set-top-actions"><button type="button" class="btn" data-set-template-save>${icon('bookmark-simple')} 保存为我的模板</button></div><div class="set-tabs" role="tablist" aria-label="约束编辑"><button type="button" id="set-tab-config" role="tab" aria-controls="set-panel-config" aria-selected="${tab==='config'}" tabindex="${tab==='config'?0:-1}" data-set-tab="config">模板配置</button><button type="button" id="set-tab-content" role="tab" aria-controls="set-panel-content" aria-selected="${tab==='content'}" tabindex="${tab==='content'?0:-1}" data-set-tab="content">目录与内容${conflicts.length?`<span class="set-tab-count">${conflicts.length}</span>`:''}</button></div>${tab==='config'?configPanel():contentPanel()}<div class="set-footer"><span class="set-footer-status">${conflicts.length?`${conflicts.length} 个文件待确认 · `:''}切换 Tab 保留草稿</span><span class="set-error" role="alert">${esc(message)}</span><button type="button" class="btn" data-set-review>${icon('git-diff')} 查看整套差异</button><button type="button" class="btn primary" data-set-save ${review&&!conflicts.length?'':'disabled'}>确认保存整套约束</button></div></div>${menuMarkup()}${overlayMarkup()}`;
    showDialog('整体编辑项目约束',body,{wide:true,retainOpen:true,subtitle:'模板配置与文件内容分别维护，保存前统一核对差异'});
    dialog().classList.add('constraint-set-dialog','set-tabbed-dialog');
    const navigation=dialog().querySelector('.set-tree>nav');
    if(navigation){navigation.scrollTop=treeScroll;const active=navigation.querySelector(`[data-set-file="${selected}"]`);if(active){const row=active.getBoundingClientRect(),bounds=navigation.getBoundingClientRect();if(row.bottom>bounds.bottom)navigation.scrollTop+=row.bottom-bounds.bottom;else if(row.top<bounds.top)navigation.scrollTop-=bounds.top-row.top;}}
    const position=positions.get(current().file);if(position){const editor=dialog().querySelector('[name=content]'),preview=dialog().querySelector('.set-live-preview');if(editor)editor.scrollTop=position.editor;if(preview)preview.scrollTop=position.preview;}
    bind();
    if(fileMenu!==null){const menu=dialog().querySelector('.set-file-menu'),anchor=dialog().querySelector(`[data-set-menu="${selected}"]`);if(anchor){const rect=anchor.getBoundingClientRect(),bounds=dialog().getBoundingClientRect();menu.style.left=Math.max(bounds.left+12,Math.min(rect.left,bounds.right-190))+'px';menu.style.top=Math.max(bounds.top+12,Math.min(rect.bottom,bounds.bottom-menu.offsetHeight-12))+'px';}menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
  }
  function switchTab(value){if(busy||overlay)return;sync();tab=value;fileMenu=null;message='';render();dialog().querySelector('#set-tab-'+value)?.focus({preventScroll:true});}
  function openOverlay(value){sync();fileMenu=null;overlay=value;message='';render();(dialog().querySelector('.set-overlay input')??dialog().querySelector('.set-overlay button'))?.focus({preventScroll:true});}
  function closeOverlay(){sync();overlay=null;message='';render();dialog().querySelector('#set-tab-'+tab)?.focus({preventScroll:true});}
  function showMenu(index){if(busy||overlay)return;sync();selected=index;fileMenu=current().file;message='';render();}
  function fileOperation(mode){sync();if(mode!=='add'&&(fixed(current().file)||conflict(current().file)))return;openOverlay({kind:'operation',mode,file:current().file,directory:parent(current().file)||moduleRoot,name:mode==='add'?'':current().file.split('/').pop()});}
  function confirmOperation(){
    sync();const operation=overlay;const name=operation.mode==='move'?operation.file.split('/').pop():operation.name.trim();
    if(!validPart(name)||! /\.mdx?$/i.test(name)){message='只填写 .md 或 .mdx 文件名，目录请从列表选择。';render();return;}
    const directory=operation.mode==='rename'?parent(operation.file):operation.directory;
    const target=directory+name;
    if(draft.files.some(item=>(operation.mode==='add'||item.file!==operation.file)&&item.file.toLowerCase()===target.toLowerCase())){message='该目录下已有同名文件，请更换名称或目录。';render();return;}
    if(draft.files.some(item=>target.toLowerCase().startsWith(item.file.toLowerCase()+'/')||item.file.toLowerCase().startsWith(target.toLowerCase()+'/'))){message='文件不能同时用作目录。';render();return;}
    let warnings=[];
    if(operation.mode==='add')draft.files.push({file:target,content:'# '+name.replace(/\.mdx?$/i,'')+'\n'});
    else {const moved=relocateDraft(draft.files,operation.file,target);draft.files=moved.files;warnings=moved.warnings;}
    for(const folder of folders([{file:target}]))collapsed.delete(folderKey(projectId,folder));
    selected=draft.files.findIndex(item=>item.file===target);overlay=null;invalidate();message=warnings.join('；');render();dialog().querySelector('[name=content]')?.focus({preventScroll:true});
  }
  function resolveConflict(choice){
    sync();const item=current(),old=conflict(item.file);
    if((choice==='incoming'&&old.incoming===null)||(choice==='current'&&old.current===null&&!item.content)){draft.files.splice(selected,1);selected=0;}
    else if(choice==='incoming')item.content=old.incoming;
    else if(choice==='merge')item.content=[item.content,old.incoming].filter(Boolean).join('\n\n');
    conflicts=conflicts.filter(value=>value!==old);invalidate();render();
    if(choice==='merge')dialog().querySelector('[name=content]')?.focus({preventScroll:true});
  }
  function mergeGeneration(files){
    const active=current()?.file,merged=mergeTemplateDraft(draft.files,generated,files);
    for(const old of conflicts){const incoming=files.find(item=>item.file===old.file),edited=draft.files.find(item=>item.file===old.file);if(incoming&&incoming.content!==edited?.content&&!merged.conflicts.some(item=>item.file===old.file))merged.conflicts.push({file:old.file,current:edited?.content??null,incoming:incoming.content});}
    draft.files=merged.files;generated=copy(files);conflicts=merged.conflicts;
    for(const item of conflicts)if(!draft.files.some(file=>file.file===item.file))draft.files.push({file:item.file,content:item.current??''});
    ensureEntries(draft);selected=Math.max(0,draft.files.findIndex(item=>item.file===active));draftFolders=new Set();positions=new Map();invalidate();
  }
  async function compose(id,selection){const ticket=++requestVersion;const result=await api(`/api/templates/${encodeURIComponent(id)}/compose`,{selection});if(ticket!==requestVersion||!dialog().open)return;templateId=id;configuration=result.selection;mergeGeneration(result.files);}
  function requireResolved(){if(!conflicts.length)return true;tab='content';selected=draft.files.findIndex(item=>item.file===conflicts[0].file);message='请先处理文件合并冲突';render();return false;}
  async function run(fn){
    if(busy)return;sync();const opened=epoch;busy=true;
    dialog().querySelector('.set-editor-main').inert=true;dialog().querySelectorAll('.set-overlay button,.set-overlay input').forEach(node=>node.disabled=true);
    try{await fn();}catch(error){if(opened===epoch)message=error.message;}
    finally{if(opened===epoch){busy=false;if(dialog().open)render();}}
  }
  async function reviewDraft(){if(!requireResolved())return;await run(async()=>{review=await api('/api/constraints/preview',payload());operationId=crypto.randomUUID();overlay={kind:'review'};message='';});dialog().querySelector('[data-set-overlay-close]')?.focus();}
  async function saveDraft(){if(!review||!requireResolved())return;await run(async()=>{const result=await api('/api/constraints',{...payload(),reviewHash:review.contentHash,operationId});closeDialog();toast('整套项目约束已保存，维护记录已留档');saved(result);});}
  function bind(){
    dialog().querySelectorAll('[data-set-tab]').forEach(node=>node.onclick=()=>switchTab(node.dataset.setTab));
    dialog().querySelectorAll('[data-set-file]').forEach(node=>{node.onclick=()=>{sync();selected=Number(node.dataset.setFile);fileMenu=null;message='';render();};node.oncontextmenu=event=>{event.preventDefault();showMenu(Number(node.dataset.setFile));};});
    dialog().querySelectorAll('[data-set-menu]').forEach(node=>node.onclick=()=>showMenu(Number(node.dataset.setMenu)));
    dialog().querySelector('[data-set-add]')?.addEventListener('click',()=>fileOperation('add'));
    dialog().querySelectorAll('[data-file-action]').forEach(node=>node.onclick=async()=>{
      const action=node.dataset.fileAction;
      if(action==='rename'||action==='move')fileOperation(action);
      else if(action==='copy'){try{await navigator.clipboard.writeText(current().file);toast('相对路径已复制');}catch{message='无法访问剪贴板，请从文件标题复制相对路径';}fileMenu=null;render();}
      else {sync();draft.files.splice(selected,1);selected=0;fileMenu=null;invalidate();render();}
    });
    dialog().querySelector('[data-set-operation-confirm]')?.addEventListener('click',confirmOperation);
    dialog().querySelector('[data-set-create-directory]')?.addEventListener('click',()=>{
      sync();const name=overlay.folderName?.trim();
      if(!validPart(name)){message='请填写单个子目录名称。';render();return;}
      const directory=overlay.directory+name+'/';
      if([...folders(draft.files),...draftFolders].includes(directory)||draft.files.some(item=>item.file.toLowerCase()===directory.slice(0,-1).toLowerCase())){message='该目录或同名文件已存在。';render();return;}
      draftFolders.add(directory);overlay.directory=directory;overlay.addingDirectory=false;message='';render();
    });
    dialog().querySelector('[name=content]')?.addEventListener('input',()=>{
      sync();invalidate();dialog().querySelector('.set-live-preview').innerHTML=markdown(current().content,current().file,projectId);dialog().querySelectorAll('[data-set-save]').forEach(node=>node.disabled=true);dialog().querySelector('.set-error').textContent='';
    });
    dialog().querySelectorAll('[data-conflict-choice]').forEach(node=>node.onclick=()=>resolveConflict(node.dataset.conflictChoice));
    dialog().querySelector('[data-set-review]').onclick=reviewDraft;
    dialog().querySelectorAll('[data-set-save]').forEach(node=>node.onclick=saveDraft);
    dialog().querySelector('[data-set-template-save]').onclick=()=>{if(requireResolved())openOverlay({kind:'template',name:''});};
    dialog().querySelector('[data-set-template-confirm]')?.addEventListener('click',()=>run(async()=>{
      if(!overlay.name?.trim())throw Error('请填写模板名称');
      const item=await api('/api/templates',{name:overlay.name.trim(),description:'项目约束整套模板',files:draft.files});templates.push(item);overlay=null;message='';toast('整套目录与正文已保存为模板');
    }));
    dialog().querySelectorAll('[data-set-resource]').forEach(node=>node.onclick=()=>openOverlay({kind:'resource',index:Number(node.dataset.setResource)}));
    dialog().querySelector('[data-set-resource-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(template().resources[overlay.index].content);toast('写作参考已复制');}catch{message='无法访问剪贴板，可直接选中参考正文复制';render();}});
    dialog().querySelector('[data-set-overlay-close]')?.addEventListener('click',()=>{if(!busy)closeOverlay();});
    dialog().onpointerdown=event=>{if(fileMenu!==null&&!event.target.closest('.set-file-menu,[data-set-menu]')){fileMenu=null;render();}};
    dialog().onkeydown=event=>{
      if(event.target.closest('.custom-select')?.querySelector('[aria-expanded=true]'))return;
      if(event.key==='Escape'&&(overlay||fileMenu!==null)){event.preventDefault();event.stopImmediatePropagation();if(busy)return;if(overlay)closeOverlay();else{fileMenu=null;render();dialog().querySelector(`[data-set-menu="${selected}"]`)?.focus();}return;}
      if(event.key==='F10'&&event.shiftKey&&event.target.closest('[data-set-file]')){event.preventDefault();showMenu(Number(event.target.closest('[data-set-file]').dataset.setFile));return;}
      if(event.target.closest('[role=tablist]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();switchTab(event.key==='Home'?'config':event.key==='End'?'content':tab==='config'?'content':'config');return;}
      if(fileMenu!==null&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...dialog().querySelectorAll('.set-file-menu button:not(:disabled)')],index=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();return;}
      if(overlay&&event.key==='Tab'){const items=[...dialog().querySelectorAll('.set-overlay button:not(:disabled),.set-overlay input:not(:disabled),.set-overlay textarea')].filter(node=>node.offsetParent!==null);if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}}
      if(overlay?.kind==='operation'&&event.key==='Enter'&&event.target.matches('[name=filename]')){event.preventDefault();confirmOperation();}
    };
  }
  return {
    rememberFolder(id,file,open){const key=folderKey(id,file);if(open)collapsed.delete(key);else collapsed.add(key);},
    selectDirectory(value){if(overlay?.kind!=='operation'||busy)return;if(value!=='__new'&&![moduleRoot,...draftFolders,...folders(draft.files)].includes(value))return;sync();overlay.addingDirectory=value==='__new';if(value!=='__new')overlay.directory=value;message='';render();dialog().querySelector('[name=folderName]')?.focus();},
    async selectTemplate(id){if(busy)return;await run(async()=>{
      if(!id){++requestVersion;templateId='';configuration={};mergeGeneration(baseline.files);return;}
      const item=templates.find(item=>item.id===id);if(!item)return;
      let selection={...(item.configuration?.defaults??{}),...(item.configuration?context.detected:{})};
      if(item.configuration)selection=changeConfiguration(item.configuration,selection);
      await compose(id,selection);
    });dialog().querySelector('#constraint-template .dropdown-trigger')?.focus({preventScroll:true});},
    async selectConfiguration(key,value){if(busy||!template()?.configuration)return;await run(()=>compose(templateId,changeConfiguration(template().configuration,configuration,key,value)));dialog().querySelector('#constraint-config-'+key+' .dropdown-trigger')?.focus({preventScroll:true});},
    async open(id){
      const opening=++epoch;++requestVersion;
      const result=await Promise.all([api(`/api/projects/${id}/constraints`),api('/api/templates'),api(`/api/projects/${id}/template-context`)]);if(opening!==epoch)return;
      projectId=id;[baseline,templates,context]=result;draft=ensureEntries({...copy(baseline),reason:''});generated=baseline.files.length?[]:copy(draft.files);selected=0;templateId='';configuration={};conflicts=[];draftFolders=new Set();positions=new Map();treeScroll=0;review=null;operationId=null;overlay=null;fileMenu=null;busy=false;message='';tab=baseline.files.length?'content':'config';render();
    },
  };
}
