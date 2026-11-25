// The project constraint tree is one editable, reusable unit.
export function ruleModules({api,showDialog,closeDialog,button,icon,esc,markdown,renderDiff,dropdown,toast,saved}) {
  let draft,baseline,templates,selected=0,projectId,templateId='',review=null,operationId,addingDirectory=false;
  const moduleRoot='.agent-workbench/rules/';
  let draftFolders=new Set();
  const parentOf=file=>file.slice(0,file.lastIndexOf('/')+1);
  const isFixed=file=>['AGENTS.md',moduleRoot+'index.md'].includes(file);
  const dialog=()=>document.querySelector('#dialog');
  const copy=value=>JSON.parse(JSON.stringify(value));
  const directories=files=>[...new Set(files.flatMap(item=>{const parts=item.file.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/')+'/');}))].filter(file=>file.startsWith('.agent-workbench/rules/'));
  function ensureEntries(tree) {
    for(const [file,content] of [['AGENTS.md','# 项目约束\n'],['.agent-workbench/rules/index.md','# 约束索引\n']]) if(!tree.files.some(item=>item.file===file)) tree.files.push({file,content});
    return tree;
  }
  const collapsedFolders=new Set();
  const folderKey=(id,file)=>JSON.stringify([id,file]);
  function treeMarkup(tree, editing, id=projectId) {
    const root='.agent-workbench/rules/';
    const fileButton=(item,index)=>`<button type="button" class="set-file ${editing && index===selected ? 'active':''}" ${editing ? `data-set-file="${index}"` : `data-action="constraint-jump" data-index="${index}"`}><span class="set-tree-slot" aria-hidden="true"></span>${icon('file-text')}<span class="set-file-text"><strong>${esc(item.file.split('/').pop())}</strong></span></button>`;
    const paths=directories(tree.files);
    const folder=(file)=>{
      const title=(file===root ? 'rules' : file.slice(0,-1).split('/').pop()).toUpperCase();
      const header=`<summary class="set-folder-row" title="${esc(file)}">${icon('caret-down')}${icon('folder')}<span class="set-folder-heading"><strong>${esc(title)}</strong>${file===root ? `<small class="set-folder-path">${esc(root)}</small>` : ''}</span></summary>`;
      const files=tree.files.map((item,index)=>({item,index})).filter(({item})=>item.file.slice(0,item.file.lastIndexOf('/')+1)===file).map(({item,index})=>fileButton(item,index)).join('');
      const nested=paths.filter(child=>child!==file && child.startsWith(file) && child.slice(file.length,-1).split('/').length===1).sort().map(folder).join('');
      return `<details class="set-folder" data-constraint-folder="${esc(file)}" data-project="${esc(id)}" ${collapsedFolders.has(folderKey(id,file)) ? '' : 'open'}>${header}<div class="set-folder-children">${files}${nested}</div></details>`;
    };
    return tree.files.map((item,index)=>({item,index})).filter(({item})=>item.file==='AGENTS.md').map(({item,index})=>fileButton(item,index)).join('')+(paths.includes(root) ? folder(root) : '');
  }
  function sync() {
    const item=draft.files[selected];if(!item)return;

    const content=dialog().querySelector('[name=content]');if(content)item.content=content.value;
    const reason=dialog().querySelector('[name=reason]');if(reason)draft.reason=reason.value;
    const field=dialog().querySelector('[name=filename]');
    if(field){
      const name=field.value.trim();
      const candidate=parentOf(item.file)+name;
      const error=!validPart(name) || !/\.mdx?$/i.test(name) ? '只需填写 .md 或 .mdx 文件名，目录请从列表选择。' : draft.files.some((other,index)=>index!==selected && other.file.toLowerCase()===candidate.toLowerCase()) ? '该目录下已有同名文件，请更换文件名或目录。' : '';
      field.setAttribute('aria-invalid',String(Boolean(error)));dialog().querySelector('.set-error').textContent=error;
      if(error)return false;
      item.file=candidate;
    }
    return true;
  }
  const validPart=name=>Boolean(name) && !name.startsWith('.') && !/[\/\\<>`|\r\n]/.test(name);
  function invalidate(){resetReview();dialog().querySelector('.set-review').hidden=true;}
  function locationMarkup(item) {
    if(isFixed(item.file))return `<div class="field"><span>文件位置</span><div class="set-fixed-location">${icon('file-text')}<span>${esc(item.file)}</span></div></div>`;
    const folders=[...new Set([moduleRoot,...draftFolders,...directories(draft.files)])].sort();
    const options=folders.map(value=>({value,label:value===moduleRoot ? 'RULES' : 'RULES / '+value.slice(moduleRoot.length,-1)}));
    return `<div class="set-location"><div class="field"><span>所在目录</span>${dropdown('constraint-directory','所在目录',[...options,{value:'__new',label:'+ 新建子目录'}],parentOf(item.file))}</div><label class="field"><span>文件名</span><input name="filename" aria-label="文件名" value="${esc(item.file.split('/').pop())}" placeholder="例如 frontend.md" autocomplete="off" spellcheck="false"></label></div>${addingDirectory ? `<div class="set-new-directory"><input name="folderName" aria-label="子目录名称" placeholder="子目录名称"><button type="button" class="btn small" data-set-create-directory>创建</button><button type="button" class="btn text small" data-set-cancel-directory>取消</button></div>` : ''}`;
  }
  function moveFile(directory) {
    const item=draft.files[selected];const target=directory+item.file.split('/').pop();
    if(draft.files.some((other,index)=>index!==selected && other.file.toLowerCase()===target.toLowerCase())){dialog().querySelector('.set-error').textContent='目标目录下已有同名文件，请先重命名。';return false;}
    draftFolders.add(parentOf(item.file));item.file=target;draftFolders.add(directory);
    for(const folder of directories([item]))collapsedFolders.delete(folderKey(projectId,folder));
    addingDirectory=false;invalidate();render();dialog().querySelector('#constraint-directory .dropdown-trigger').focus();return true;
  }
  function payload(){return {projectId,baseHash:baseline.baseHash,files:draft.files,reason:draft.reason ?? ''};}
  function currentPreview() {
    const item=draft.files[selected];
    return `<section class="set-preview-file"><header><strong>${esc(item.file)}</strong></header>${markdown(item.content,item.file,projectId)}</section>`;
  }
  function resetReview(){review=null;operationId=null;const save=dialog().querySelector('[data-set-save]');if(save)save.disabled=true;}
  function refreshPreview(){dialog().querySelector('.set-live-preview').innerHTML=currentPreview();}
  const templatePicker=()=>dropdown('constraint-template','项目约束模板',[{value:'',label:'当前项目'},...templates.map(t=>({value:t.id,label:t.builtin ? t.name : '我的模板 · '+t.name}))],templateId);
  function render() {
    const item=draft.files[selected]; const locked=isFixed(item.file);
    showDialog('整体编辑项目约束',`<div class="set-template-bar"><div class="set-template-control"><span>项目约束模板</span>${templatePicker()}</div><div class="set-template-save"><input name="templateName" aria-label="模板名称" placeholder="模板名称" maxlength="80"><button type="button" class="btn" data-set-template-save>${icon('bookmark-simple')} 保存模板</button></div></div><p class="set-template-scope">模板仅复用项目约束；维护记录的写法与更新流程见「Skill 接入」。</p><div class="set-editor-layout"><aside class="set-tree"><div class="row between"><strong>目录与文件</strong><button type="button" class="btn text small" data-set-add>${icon('plus')} 新增文件</button></div><nav aria-label="编辑约束文件">${treeMarkup(draft,true)}</nav></aside><section class="set-file-editor"><div class="row between"><strong>文件内容</strong>${!locked ? '<button type="button" class="btn text small" data-set-remove>移除此文件</button>' : '<span class="pill">固定入口</span>'}</div>${locationMarkup(item)}<label class="field set-body"><span>Markdown 正文</span><textarea name="content" aria-label="约束正文" spellcheck="false">${esc(item.content)}</textarea></label></section><section class="set-preview-pane"><div class="set-preview-title"><strong>${icon('eye')} 当前文件预览</strong></div><div class="set-live-preview">${currentPreview()}</div></section></div><div class="set-review" hidden></div><div class="set-footer"><input name="reason" aria-label="变更说明" placeholder="变更说明（选填）" value="${esc(draft.reason)}"><span class="set-error" role="alert"></span><button type="button" class="btn" data-set-review>${icon('git-diff')} 查看整套差异</button><button type="button" class="btn primary" data-set-save disabled>确认保存整套约束</button></div>`,{wide:true,subtitle:'同一份项目约束 · 调整目录和正文，当前文件预览与整体保存'});
    dialog().classList.add('constraint-set-dialog');
    dialog().querySelectorAll('[data-set-file]').forEach(node=>node.onclick=()=>{if(!sync())return;selected=Number(node.dataset.setFile);addingDirectory=false;render();});
    dialog().querySelector('[data-set-add]').onclick=()=>{
      if(!sync())return;const directory=parentOf(draft.files[selected].file) || moduleRoot;let index=1;let file;do{file=`${directory}new-${index++}.md`;}while(draft.files.some(item=>item.file.toLowerCase()===file.toLowerCase()));
      for(const folder of directories([{file}]))collapsedFolders.delete(folderKey(projectId,folder));draft.files.push({file,content:'# 新约束\n'});selected=draft.files.length-1;addingDirectory=false;resetReview();render();dialog().querySelector('[name=filename]').focus();dialog().querySelector('[name=filename]').select();
    };
    dialog().querySelector('[data-set-remove]')?.addEventListener('click',()=>{sync();draft.files.splice(selected,1);selected=0;resetReview();render();});
    dialog().querySelectorAll('[name=filename],[name=content],[name=reason]').forEach(node=>node.addEventListener('input',()=>{invalidate();if(!sync())return;refreshPreview();dialog().querySelector(`[data-set-file="${selected}"] strong`).textContent=draft.files[selected].file.split('/').pop();}));
    dialog().querySelector('[data-set-cancel-directory]')?.addEventListener('click',()=>{addingDirectory=false;render();dialog().querySelector('#constraint-directory .dropdown-trigger').focus();});
    const createDirectory=()=>{
      if(!sync())return;
      const field=dialog().querySelector('[name=folderName]');const name=field.value.trim();
      if(!validPart(name)){dialog().querySelector('.set-error').textContent='请填写单个子目录名称，不需要输入路径。';field.focus();return;}
      const directory=parentOf(draft.files[selected].file)+name+'/';
      if([...directories(draft.files),...draftFolders].includes(directory)){dialog().querySelector('.set-error').textContent='该子目录已存在，请从目录列表选择。';return;}
      if(draft.files.some(item=>item.file.toLowerCase()===directory.slice(0,-1).toLowerCase())){dialog().querySelector('.set-error').textContent='已有同名文件，不能创建该目录。';return;}
      moveFile(directory);
    };
    dialog().querySelector('[data-set-create-directory]')?.addEventListener('click',createDirectory);
    dialog().querySelector('[name=folderName]')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();createDirectory();}});
    dialog().querySelector('[data-set-template-save]').onclick=async()=>{
      if(!sync())return; const name=dialog().querySelector('[name=templateName]').value.trim();
      await run(async()=>{const template=await api('/api/templates',{name,description:'项目约束整套模板',files:draft.files});templates.push(template);dialog().querySelector('#constraint-template').outerHTML=templatePicker();toast('整套目录与正文已保存为模板');});
    };
    dialog().querySelector('[data-set-review]').onclick=async()=>{if(!sync())return;await run(async()=>{
      review=await api('/api/constraints/preview',payload());operationId=crypto.randomUUID();
      const node=dialog().querySelector('.set-review');node.innerHTML=`<div class="row between"><strong>整套变更 · ${review.files.length} 个文件</strong><span class="muted small">确认后统一写入并记录</span></div>${renderDiff(review)}`;node.hidden=false;
      dialog().querySelector('[data-set-save]').disabled=false;node.scrollIntoView({behavior:'smooth',block:'start'});
    });};
    dialog().querySelector('[data-set-save]').onclick=async()=>{if(!review)return;await run(async()=>{
      const result=await api('/api/constraints',{...payload(),reviewHash:review.contentHash,operationId});closeDialog();toast('整套项目约束已保存，维护记录已留档');saved(result);
    });};
    if(review){const node=dialog().querySelector('.set-review');node.innerHTML=renderDiff(review);node.hidden=false;dialog().querySelector('[data-set-save]').disabled=false;}
  }
  async function run(fn){const node=dialog().querySelector('.set-error');node.textContent='';const buttons=[...dialog().querySelectorAll('[data-set-save],[data-set-review],[data-set-template-save]')];buttons.forEach(button=>button.disabled=true);try{await fn();}catch(error){node.textContent=error.message;}finally{if(dialog().open){buttons.forEach(button=>button.disabled=false);dialog().querySelector('[data-set-save]').disabled=!review;}}}
  return {
    rememberFolder(id,file,open){const key=folderKey(id,file);if(open)collapsedFolders.delete(key);else collapsedFolders.add(key);},
    selectDirectory(directory){if(!sync())return;if(directory==='__new'){addingDirectory=true;render();dialog().querySelector('[name=folderName]').focus();return;}if(directory.startsWith(moduleRoot) && [...directories(draft.files),...draftFolders,moduleRoot].includes(directory))moveFile(directory);},
    selectTemplate(id){if(!sync())return;draftFolders=new Set();addingDirectory=false;templateId=id;const template=templates.find(item=>item.id===id);draft=template ? {...copy(template),reason:draft.reason} : {...copy(baseline),reason:draft.reason};ensureEntries(draft);selected=0;resetReview();render();dialog().querySelector('#constraint-template .dropdown-trigger').focus();},
    async open(id){projectId=id;draftFolders=new Set();addingDirectory=false;[baseline,templates]=await Promise.all([api(`/api/projects/${id}/constraints`),api('/api/templates')]);draft=ensureEntries({...copy(baseline),reason:''});selected=0;templateId='';review=null;operationId=null;render();},

  };
}
