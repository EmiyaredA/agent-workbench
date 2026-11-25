import { renderMaintenance } from './maintenance.js';
import { ruleModules } from './rule-modules.js';
import { architectureBoard } from './architecture.js';
import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const button = (label, action, attributes = '', classes = '') => `<button type="button" class="btn ${classes}" data-action="${action}" ${attributes}>${label}</button>`;
const statusNames = {pending:'待审',applied:'已写入',recorded:'已记录',recording:'记录中',rejected:'已拒绝',conflict:'冲突',superseded:'已替代',implemented:'已落地',proposed:'方案稿',archived:'已归档',current:'当前文档'};
const categoryNames = {architecture:'架构',feature:'功能', 'bug-fix':'缺陷修复',simplification:'简化',process:'流程',testing:'验证'};
const categoryBadge = item => `<span class="pill ${item.category ? 'category-'+esc(item.category) : 'unlabeled'}">${esc(categoryNames[item.category] ?? '未标注')}</span>`;
const categoryField = (id,value='') => `<div class="field"><span>迭代标签 *</span>${dropdown(id,'迭代标签',[{value:'',label:'请选择标签'},...Object.entries(categoryNames).map(([value,label])=>({value,label}))],value)}<input type="hidden" name="category" value="${esc(value)}"></div>`;
const scopeNames = {global:'全局',project:'项目',module:'项目'};
const badge = status => `<span class="pill ${esc(status)}">${esc(statusNames[status] ?? status)}</span>`;
const scopeBadge = scope => `<span class="pill">${esc(scopeNames[scope] ?? scope)}</span>`;
const plain = content => String(content ?? '').replace(/<!--[^]*?-->/g,'').replace(/^#{1,6}\s.*$/gm,'').replace(/[*`]/g,'').trim();
const localDate = value => new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
function markdown(content, file = '', projectId = '', decision = false) {
  const renderer = new marked.Renderer();
  renderer.html = ({text}) => text.replace(/<!--[^]*?-->/g,'').trim() ? esc(text) : '';
  renderer.image = ({text,href}) => `<a href="${esc(href)}">图片：${esc(text)}</a>`;
  const sanitized = DOMPurify.sanitize(marked.parse(content ?? '',{renderer}), { ALLOW_DATA_ATTR:false, ALLOW_ARIA_ATTR:false, FORBID_TAGS:['img','style','form','input','button','iframe','svg','math'], FORBID_ATTR:['style','id','name'] });
  const template = document.createElement('template'); template.innerHTML = sanitized;
  if (decision) {
    const names = {Problem:'背景',Decision:'采用的方案',Proposal:'曾拟议的方案','Alternatives considered':'放弃的备选',Consequences:'收益与代价',Verification:'验证',Testing:'验证',Risks:'风险与取舍'};
    template.content.querySelectorAll('h1').forEach(node => { node.textContent = node.textContent.replace(/^Agent Note[:：]\s*/,''); });
    template.content.querySelectorAll('h2').forEach(node => { if (names[node.textContent]) node.textContent = names[node.textContent]; });
    [...template.content.children].slice(0,3).forEach(node => { if (node.tagName === 'P' && /^Status:\s*(implemented|proposed|rejected|archived)/.test(node.textContent)) node.remove(); });
  }
  return `<div class="markdown" data-file="${esc(file)}" data-project="${esc(projectId)}">${template.innerHTML}</div>`;
}
const attr = (name,value) => `data-${name}="${esc(value)}"`;
const displayMode = (action, raw) => `<div class="display-mode" role="group" aria-label="文档显示方式">${button('预览',action,`${attr('mode','read')} aria-pressed="${!raw}" title="查看排版后的文档"`,'display-mode-option')}${button('Markdown',action,`${attr('mode','raw')} aria-pressed="${!!raw}" title="查看 Markdown 源码"`,'display-mode-option')}</div>`;
const viewSwitcher = (label, action, items, current, classes = '') => `<div class="view-switcher ${classes}" role="group" aria-label="${esc(label)}"><span class="view-switcher-label" aria-hidden="true">视图</span>${items.map(([view,name,glyph]) => button(icon(glyph)+`<span>${esc(name)}</span>`,action,`${attr('view',view)} aria-pressed="${current === view}"`,current === view ? 'view-option active' : 'view-option')).join('')}</div>`;

function dropdown(id, label, options, value, classes = '') {
  const selected = options.find(option => option.value === value);
  return `<div class="custom-select ${classes}" id="${id}"><button type="button" class="dropdown-trigger" data-action="dropdown-toggle" aria-label="${esc(label)}：${esc(selected?.label ?? label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-options" title="${esc(selected?.label ?? label)}"><span>${esc(selected?.label ?? label)}</span>${icon('caret-down')}</button><div class="dropdown-menu" id="${id}-options" role="listbox" aria-label="${esc(label)}" hidden>${options.map(option => `<button type="button" class="dropdown-option" role="option" tabindex="-1" aria-selected="${option.value === value}" data-action="dropdown-option" data-value="${esc(option.value)}"><span class="option-label">${esc(option.label)}</span>${option.value === value ? icon('check') : ''}</button>`).join('')}</div></div>`;
}
let focusSelectAfterRender = '';
let focusViewAfterRender;
function closeDropdowns(restoreFocus = false) {
  document.querySelectorAll('.custom-select [aria-expanded="true"]').forEach(trigger => {
    trigger.setAttribute('aria-expanded','false'); trigger.nextElementSibling.hidden = true;
    if (restoreFocus) trigger.focus();
  });
}
function openDropdown(control, position) {
  closeDropdowns(); const trigger = control.querySelector('.dropdown-trigger'); const menu = control.querySelector('.dropdown-menu');
  trigger.setAttribute('aria-expanded','true'); menu.hidden = false;
  const options = [...menu.querySelectorAll('[role=option]')];
  const selected = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
  const index = position === 'first' ? 0 : position === 'last' ? options.length-1 : Math.max(0,selected);
  options[index]?.focus();
}

const S = {session:null,data:null,projectId:'',view:'rules',file:'',proposal:'',raw:false,skillRaw:false,proposalFilter:'all',changeView:'list',changeQuery:'',logMode:'journal',month:'',noteStatus:'all',searchKind:'all',lastProject:'',message:null};
const maintenanceDefaults = {maintenanceView:'baseline',maintenanceSelection:'',maintenanceFormat:'read',month:'',noteStatus:'all',maintenanceCategory:'',maintenanceQuery:'',maintenanceSort:'newest'};
Object.assign(S,maintenanceDefaults);
let lastMaintenanceFocus; let focusMaintenanceAfterRender=false; let maintenanceOriginScroll; let maintenanceAnchor=''; let maintenanceDrawerScroll;
let renderSequence = 0; let lastFocus; let toastTimeout;
let lastChangeFocus=''; let restoreChangeFocus=false;
const collapsedFolders = new Set();
const folderKey = folder => JSON.stringify([S.projectId,folder]);
function revealFile(file) {
  const parts = file.split('/'); parts.pop();
  parts.forEach((_,index) => collapsedFolders.delete(folderKey(parts.slice(0,index+1).join('/'))));
}
function fileTree(documents) {
  const root = {directories:new Map(),files:[]};
  for (const doc of documents) {
    const parts = doc.file.split('/'); parts.pop(); let node = root;
    parts.forEach((name,index) => {
      if (!node.directories.has(name)) node.directories.set(name,{name,path:parts.slice(0,index+1).join('/'),directories:new Map(),files:[]});
      node = node.directories.get(name);
    });
    node.files.push(doc);
  }
  const render = node => node.files.map(doc => `<button class="file-button ${doc.file === S.file ? 'active':''}" data-action="file" data-file="${esc(doc.file)}" title="${esc(doc.file)}" ${doc.file === S.file ? 'aria-current="page"':''}>${icon('file-text')}<span class="file-tree-label"><strong>${esc(doc.file.split('/').pop())}${doc.superseded ? ' · 已替代':''}</strong></span></button>`).join('')
    + [...node.directories.values()].sort((a,b) => a.name.localeCompare(b.name)).map(dir => `<details class="file-directory" data-directory="${esc(dir.path)}" ${collapsedFolders.has(folderKey(dir.path)) ? '' : 'open'}><summary data-action="folder" title="${esc(dir.path)}">${icon('caret-right')}${icon('folder')}<span>${esc(dir.name)}</span></summary><div class="directory-children">${render(dir)}</div></details>`).join('');
  return render(root);
}


async function api(url, body, method = body === undefined ? 'GET' : 'POST') {
  let response;
  try { response = await fetch(url,{ method, headers:body === undefined ? {} : {'Content-Type':'application/json','X-Workbench-Nonce':S.session.nonce}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) }); }
  catch { throw Error('本地服务暂时不可达，请检查服务后重试。已填写内容仍保留。'); }
  const result = await response.json();
  if (!response.ok) { const error = Error(result.error ?? '操作失败'); error.status = response.status; throw error; }
  return result;
}
function toast(message,error = false) {
  clearTimeout(toastTimeout); const node = $('#toast'); node.textContent = message; node.className = 'show' + (error ? ' error' : '');
  toastTimeout = setTimeout(() => node.className = '',error ? 7000 : 4000);
}
function route(view, options = {}) {
  if (options.projectId && options.projectId !== S.projectId) Object.assign(S,maintenanceDefaults,{changeQuery:'',changeView:'list',proposalFilter:'all',proposal:''});
  if ((options.projectId ?? S.projectId) === 'global' && ['journal','architecture'].includes(view)) { view='rules'; options={...options,maintenanceSelection:''}; }
  Object.assign(S,options,{view});
  if (options.file) revealFile(options.file);
  const hash = new URLSearchParams({project:S.projectId,view,file:S.file,proposal:S.proposal,...(view==='proposals' ? {changeView:S.changeView,changeQuery:S.changeQuery,proposalFilter:S.proposalFilter} : {}),...(view === 'journal' ? Object.fromEntries(Object.keys(maintenanceDefaults).map(key=>[key,S[key]])) : {})}).toString();
  if (location.hash.slice(1) === hash) load(); else location.hash = hash;
}
function readRoute() {
  const previous = S.projectId+'|'+S.file;
  const values = new URLSearchParams(location.hash.slice(1));
  for (const [field,key] of [['projectId','project'],['view','view'],['file','file'],['proposal','proposal']]) if (values.has(key)) S[field] = values.get(key);
  for (const key of ['changeView','changeQuery','proposalFilter']) if (values.has(key)) S[key]=values.get(key);
  if (!['timeline','list'].includes(S.changeView)) S.changeView='list';
  if (!['all','pending','recorded','applied','rejected'].includes(S.proposalFilter)) S.proposalFilter='all';
  if (values.get('project') && values.get('project') !== previous.split('|')[0]) Object.assign(S,maintenanceDefaults);
  for (const [key,value] of Object.entries(maintenanceDefaults)) S[key] = values.has(key) ? values.get(key) : value;
  if (!['baseline','timeline','pitfalls','list'].includes(S.maintenanceView)) S.maintenanceView='baseline';
  if (!['rules','proposals','journal','connect','architecture'].includes(S.view)) S.view = 'rules';
  if (S.projectId === 'global' && ['journal','architecture'].includes(S.view)) {
    S.view='rules'; Object.assign(S,maintenanceDefaults);
    values.set('view','rules'); for (const key of Object.keys(maintenanceDefaults)) values.delete(key);
    history.replaceState(null,'','#'+values.toString());
  }
  if (previous !== S.projectId+'|'+S.file) revealFile(S.file);
}
function sourceId() { return S.projectId; }
function pending(id = S.projectId) { return S.data.proposals.filter(p => p.projectId === id && ['pending','conflict'].includes(p.status)); }
function activeProject() { return S.projectId === 'global' ? {name:'全局偏好',root:S.data.global ? `${S.data.global.root}/${S.data.global.file}` : '',id:'global'} : S.data.projects.find(p => p.id === S.projectId); }
function keepSelectedFileVisible() {
  const tree = $('.file-tree'); const selected = tree?.querySelector('.file-button.active');
  if (!selected?.getClientRects().length || tree.scrollHeight <= tree.clientHeight) return;
  const bounds = tree.getBoundingClientRect(); const item = selected.getBoundingClientRect();
  if (item.top < bounds.top) tree.scrollTop += item.top - bounds.top;
  else if (item.bottom > bounds.bottom) tree.scrollTop += item.bottom - bounds.bottom;
}
function updateMaintenanceLayout() {
  const modal = (S.view==='journal' && !!S.maintenanceSelection || S.view==='proposals' && !!S.proposal) && !!document.querySelector('.maintenance-detail');
  document.querySelectorAll('.sidebar,.header,.maintenance-nav,.maintenance-filters,.maintenance-content,.change-controls,.change-stream,.demo-bar,.maintenance-warnings').forEach(node=>node.inert=modal);
  const detail=document.querySelector('.maintenance-detail');
  if (detail) { if (modal) { detail.setAttribute('role','dialog'); detail.setAttribute('aria-modal','true'); } else { detail.removeAttribute('role'); detail.removeAttribute('aria-modal'); } }
  document.body.classList.toggle('maintenance-drawer-open',modal);
}
window.addEventListener('resize',updateMaintenanceLayout);
function shell(content) {
  const project = activeProject();
  const projectButtons = S.data.projects.map(p => `<button class="project-button ${S.projectId === p.id ? 'active' : ''}" data-action="project" data-id="${esc(p.id)}">${icon('folder')}<span>${esc(p.name)}</span>${pending(p.id).length ? `<span class="pill pending">${pending(p.id).length}</span>` : ''}</button>`).join('');
  const tabs = (S.projectId === 'global' ? [['rules','全局约束'],['proposals','变更记录']] : [['rules','约束'],['proposals','变更记录'],['journal','维护记录'],['architecture','架构']]).map(([id,label]) => `<button class="tab ${S.view === id ? 'active' : ''}" data-action="tab" data-view="${id}" aria-current="${S.view === id ? 'page' : 'false'}">${label}${id === 'proposals' && pending().length ? `<span class="count">${pending().length}</span>` : ''}</button>`).join('');
  $('#app').innerHTML = `<aside class="sidebar"><div class="brand"><span class="brand-mark"><img src="/assets/kurisu-avatar.png" width="44" height="44" alt="Q 版红莉栖" decoding="async"></span><span class="brand-name"><strong><span>agent-</span>workbench</strong><small>你的 Agent 工作台</small></span></div><div class="project-label">项目 <span>${S.data.projects.length}</span></div><div class="projects">${projectButtons || '<p class="muted small">尚未登记项目</p>'}</div>${button(icon('plus')+' 登记项目','register','','register')}<div class="sidebar-bottom"><button class="project-button ${S.projectId === 'global' ? 'active':''}" data-action="global">${icon('gear-six')}<span>全局偏好</span></button><button class="project-button ${S.view === 'connect' ? 'active':''}" data-action="connect">${icon('plugs')}<span>Skill 接入</span></button><button class="project-button" data-action="local">${icon('folder-open')}<span>本地文件</span></button></div><div class="local-note">LOCAL · FILES FIRST · v0.1</div>${dropdown('project-switcher','切换项目',[...S.data.projects.map(p => ({value:p.id,label:p.name})),{value:'__global',label:'全局偏好'},{value:'__connect',label:'Skill 接入'},{value:'__register',label:'登记项目…'}],S.view === 'connect' ? '__connect' : S.projectId === 'global' ? '__global' : S.projectId,'mobile-project')}</aside><main class="app-main"><header class="header"><div class="header-top"><h1 title="${esc(project?.root ?? '')}">${esc(project?.name ?? '我的项目')}</h1><span class="root-path" title="${esc(project?.root)}">${esc(project?.root ?? '登记项目后开始使用')}</span><nav class="tabs" aria-label="项目页面">${tabs}</nav><div class="header-context" role="group" aria-label="当前页面操作"></div><button class="btn header-search" data-action="search" aria-label="搜索文档与提案" ${!project ? 'disabled':''}>${icon('magnifying-glass')}<span class="search-text">搜索文档与提案</span><span class="key">/</span></button>${button(icon('gear-six'),'settings','aria-label="文档来源设置" title="文档来源设置"','icon')}</div></header>${S.session.demo ? '<div class="demo-bar">演示工作区 · 数据隔离</div>':''}${S.data.warnings?.length ? `<div class="page">${S.data.warnings.map(w => `<p class="notice warning">${esc(w)}</p>`).join('')}</div>` : ''}${S.message ? `<div class="page"><div class="notice ${esc(S.message.type ?? 'success')}">${esc(S.message.text)}</div></div>`:''}${content}</main>`;
  const toolbar = document.querySelector('.app-main > .page .proposal-toolbar, .app-main > .page .maintenance-nav');
  if (toolbar) {
    document.querySelector('.header-context').append(toolbar);
    document.querySelector('.header').classList.add('has-context');
  }
  keepSelectedFileVisible();
  updateMaintenanceLayout();
  if (S.view==='proposals' && S.proposal) $('.change-detail')?.focus({preventScroll:true});
  if (restoreChangeFocus) { [...document.querySelectorAll('.change-card')].find(node=>node.dataset.id===lastChangeFocus)?.focus({preventScroll:true}); restoreChangeFocus=false; }
  if (S.view === 'journal' && S.maintenanceSelection) {
    const detail=$('.maintenance-detail');
    if (detail) {
      detail.scrollTop=maintenanceDrawerScroll?.selection===S.maintenanceSelection && maintenanceDrawerScroll?.format===S.maintenanceFormat ? maintenanceDrawerScroll.top : 0;
      detail.focus({preventScroll:true});
      if (maintenanceAnchor) { scrollMaintenanceAnchor(maintenanceAnchor); maintenanceAnchor=''; }
    }
  }
  if (focusMaintenanceAfterRender) { const candidates=[...document.querySelectorAll('[data-action=maintenance-open]')]; candidates.find(node=>node.dataset.kind===lastMaintenanceFocus?.kind && node.dataset.key===lastMaintenanceFocus?.key)?.focus({preventScroll:true}); focusMaintenanceAfterRender=false; if(maintenanceOriginScroll)window.scrollTo(maintenanceOriginScroll.x,maintenanceOriginScroll.y); maintenanceOriginScroll=undefined; }
  if (focusSelectAfterRender) { document.getElementById(focusSelectAfterRender)?.querySelector('.dropdown-trigger')?.focus(); focusSelectAfterRender = ''; }
  if (focusViewAfterRender) { const {action,view} = focusViewAfterRender; document.querySelector(`.view-switcher [data-action="${action}"][data-view="${view}"]`)?.focus({preventScroll:true}); focusViewAfterRender=undefined; }
}
function empty(title, description, actions = '', glyph = 'files') { return `<div class="empty">${icon(glyph)}<h2>${esc(title)}</h2><p>${esc(description)}</p><div class="actions">${actions}</div></div>`; }

async function load() {
  const previousDetail=$('.maintenance-detail:not(.change-detail)');
  maintenanceDrawerScroll=previousDetail ? {selection:previousDetail.dataset.selection,format:previousDetail.dataset.format,top:previousDetail.scrollTop} : undefined;
  const sequence = ++renderSequence; readRoute();
  if (previousDetail && !S.maintenanceSelection) focusMaintenanceAfterRender=true;
  try {
    const data = await api('/api/state'); if (sequence !== renderSequence) return; S.data = data;
    if (S.projectId !== 'global' && !S.data.projects.some(p => p.id === S.projectId)) S.projectId = S.data.projects[0]?.id ?? '';
    if (S.projectId === 'global' && !S.data.global) S.projectId = S.data.projects[0]?.id ?? '';
    if (S.projectId && S.projectId !== 'global') S.lastProject = S.projectId;
    let content;
    if (!S.projectId && S.view !== 'connect') content = welcome();
    else if (S.view === 'connect') content = await connection(sequence);
    else if (S.view === 'architecture') content = await architecture.render(S.projectId);
    else if (['rules','proposals','journal'].includes(S.view)) {
      const catalog = await api(`/api/projects/${S.projectId}`); if (sequence !== renderSequence) return; S.catalog = catalog;
      if (S.view === 'rules') content = await rules(sequence);
      if (S.view === 'proposals') content = await proposals(sequence);
      if (S.view === 'journal') content = await journal(sequence);
    }
    if (sequence !== renderSequence) return;
    shell(content);
    if (S.view === 'architecture') architecture.mount();
  } catch(error) {
    if (sequence !== renderSequence) return;
    if (S.data) shell(`<div class="page"><div class="notice error">${esc(error.message)}</div><div class="actions">${button('重试读取','refresh')}</div></div>`);
    else $('#app').innerHTML = `<div class="page"><h1>无法读取本地工作区</h1><p>${esc(error.message)}</p>${button('重试','refresh')}</div>`;
    toast(error.message,true);
  }
}

function welcome() {
  return `<div class="page">${empty('从一个项目开始','登记已有的本机目录，查看约束文件与维护记录。',button(icon('folder-plus')+' 登记第一个项目','register','','primary'))}</div>`;
}
async function rules(sequence) {
  const id = sourceId();
  const catalog = id === S.projectId ? S.catalog : await api(`/api/projects/${id}`);
  if (sequence !== renderSequence) return '';
  const documents = catalog.docs.filter(d => d.role === 'rule').sort((a,b) => Number(catalog.project.ruleFiles.includes(b.file)) - Number(catalog.project.ruleFiles.includes(a.file)));
  if (!documents.some(d => d.file === S.file)) S.file = documents[0]?.file ?? catalog.project.ruleFiles[0];
  const document = await api(`/api/projects/${id}/document?file=${encodeURIComponent(S.file)}`); if (sequence !== renderSequence) return ''; S.document = document;
  const fileButtons = fileTree(documents);
  const proposal = pending(id).find(p => (p.file === S.file || p.affectedFiles?.includes(S.file)));
  let inspector;
  if (proposal) {
    const detail = await api(`/api/proposals/${proposal.id}`); if (sequence !== renderSequence) return '';
    inspector = `<div class="row between"><h2>待审提案</h2>${badge(proposal.status)}</div><h3>${esc(proposal.title)}</h3><dl class="meta"><dt>范围</dt><dd>${scopeBadge(proposal.scope)}</dd><dt>来源</dt><dd>${esc(proposal.source)}</dd><dt>文件</dt><dd class="mono">${esc(catalog.project.root)}/${esc(S.file)}</dd></dl><hr><span class="label">差异摘要</span><div class="mini-diff">${detail.changes.filter(c => c.added || c.removed).slice(0,4).map(c => `<div class="${c.added ? 'diff-add':'diff-remove'}">${c.added ? '+':'−'} ${esc(c.value.slice(0,180))}</div>`).join('')}</div><div class="actions">${button('审核差异','open-proposal',attr('id',proposal.id),'primary')}${button('稍后处理','later')}</div><p class="muted small">批准具体差异后，才会写入约束。</p>`;
  } else inspector = `<h2>当前约束</h2><p class="muted small">${id === 'global' ? '全局偏好独立保存，项目按需引用。':'正式内容保存在原始文件中。'}</p><dl class="meta"><dt>范围</dt><dd>${scopeBadge(id === 'global' ? 'global':'project')}</dd><dt>文件</dt><dd class="mono">${esc(catalog.project.root)}/${esc(S.file)}</dd></dl><hr><p class="muted small">${id === 'global' ? '全局偏好的修改在变更记录中追溯。' : '看板展示当前文件与关联记录。内容由 Agent / CLI 维护，维护日志与历史决定不自动变成有效指令。'}</p>`;
  const logs = id === 'global' ? [] : (await api(`/api/projects/${id}/journal`)).slice(0,2); if (sequence !== renderSequence) return '';
  const decisions = catalog.docs.filter(d => d.role === 'decision' && d.status === 'implemented').slice(0,2);
  const selected = documents.find(doc => doc.file === S.file);
  const lineage = selected?.superseded ? `<p class="notice warning">此说明已被替代，不作为当前有效约束。${selected.supersededBy ? ' '+button('查看替代文档','document',`${attr('file',selected.supersededBy)} ${attr('project',id)}`,'text small') : ''}</p>` : '';
  const content = !S.document.exists ? empty('还没有这份约束','可以创建并记录，也可以先提出建议。','','file-plus') : S.raw ? `<pre>${esc(S.document.content)}</pre>` : markdown(S.document.content,S.file,id);
  const history=S.data.proposals.filter(p=>p.projectId===id && (p.file===S.file || p.affectedFiles?.includes(S.file)));
  const changeHistory=`<section class="related-log"><h2>约束迭代 · ${history.length}</h2>${history.slice(0,4).map(p=>`<p>${button(esc(p.title),'open-proposal',attr('id',p.id),'text small')} ${categoryBadge(p)} ${badge(p.status)} <span class="muted small">${esc(localDate(p.updatedAt))}</span></p>`).join('') || '<p class="muted small">尚无通过 Agent / CLI 留档的约束变更。</p>'}${button('查看全部变更','tab',attr('view','proposals'),'text small')}</section>`;

  return `<div class="workspace"><aside class="file-rail"><div class="file-heading">${id === 'global' ? '全局约束' : '约束文件'}<span class="file-count">${documents.length}</span></div><nav class="file-list file-tree" aria-label="约束目录">${fileButtons || '<p class="muted small">尚无文档</p>'}</nav></aside><article class="reader"><div class="doc-toolbar">${displayMode('read-mode',S.raw)}${id !== 'global' ? button('整体编辑','edit-constraints','','text small') : ''}</div>${catalog.warnings.map(w => `<p class="notice warning">${esc(w.message)}</p>`).join('')}${lineage}${content}</article><aside class="inspector">${inspector}${decisions.length ? `<hr><h3>相关决定</h3>${decisions.map(d => button(esc(d.title),'document',`${attr('file',d.file)} ${attr('project',id)}`,'text doc-link')).join('')}`:''}${changeHistory}${id !== 'global' ? `<section class="related-log"><h2>相关维护</h2>${logs.length ? `<div class="mini-timeline">${logs.map((entry,index) => `<button data-action="log-preview" data-index="${index}" data-project="${esc(id)}">${esc(entry.title.replace(/^\d{4}-\d{2}-\d{2}\s*[·—-]?\s*/,''))}</button>`).join('')}</div>` : '<p class="muted small">尚无维护记录。</p>'}${button('查看维护路径 '+icon('arrow-up-right'),'tab',attr('view','journal'),'text small')}</section>` : ''}</aside></div>`;
}

function renderDiff(detail) {
  if (detail.fileChanges) return detail.fileChanges.map(item => `<section class="module-file-diff"><h3>${esc(item.file)} <span class="pill">${item.content === null ? '移除' : item.baseContent === null ? '新增':'更新'}</span></h3>${renderDiff({...detail,...item,fileChanges:null})}${item.currentError || (Object.hasOwn(item,'currentContent') && ((detail.status==='pending' && item.currentContent!==item.baseContent) || detail.status==='conflict')) ? `<details><summary>查看磁盘当前内容</summary><pre>${esc(item.currentError ?? item.currentContent ?? '文件不存在')}</pre></details>` : ''}</section>`).join('');
  let left = 0; let right = 0;
  const column = added => detail.changes.filter(change => added ? !change.removed : !change.added).map(change => {
    const lines = change.value.replace(/\n$/,'').split('\n');
    return lines.map(text => `<div class="diff-line ${change.added ? 'diff-add' : change.removed ? 'diff-remove':''}"><span class="line-num">${added ? ++right : ++left}</span><span>${esc(text) || ' '}</span></div>`).join('');
  }).join('');
  return `<div class="diff-grid"><div class="diff-column"><div class="diff-heading">${detail.mode==='direct' ? '修改前':'当前内容（提案基线）'}</div><div class="diff-body">${column(false) || '<div class="diff-line muted">文件尚不存在</div>'}</div></div><div class="diff-column"><div class="diff-heading">${detail.mode==='direct' ? '修改后' : `建议内容（第 ${detail.revision} 版）`}</div><div class="diff-body">${column(true)}</div></div></div>`;
}
async function proposals(sequence) {
  const all = S.data.proposals.filter(p => p.projectId === S.projectId);
  const filtered = all.filter(p => S.proposalFilter === 'all' || S.proposalFilter === 'pending' ? S.proposalFilter === 'all' || ['pending','conflict'].includes(p.status) : p.status === S.proposalFilter);
  if (!all.some(p => p.id === S.proposal)) S.proposal = '';
  const visibleItems=filtered.filter(p=>!S.changeQuery || [p.title,p.reason,p.source,p.file].join(' ').toLowerCase().includes(S.changeQuery.toLowerCase()));
  const filters = [['all','全部'],['recorded','已记录'],['pending','待审'],['applied','已写入'],['rejected','已拒绝']].map(([id,label]) => `<button class="segment ${S.proposalFilter === id ? 'active':''}" data-action="proposal-filter" data-filter="${id}">${label}</button>`).join('');
  let content;
  if (!S.proposal) content = '';
  else {
    const detail = await api(`/api/proposals/${S.proposal}`); if (sequence !== renderSequence) return ''; S.proposalDetail = detail;
    const changed = detail.fileChanges ? detail.fileChanges.some(item=>item.currentError || item.currentContent!==item.baseContent) : detail.currentError || detail.currentContent !== detail.baseContent;
    const conflict = !detail.applicationPending && (detail.status === 'conflict' || (detail.status === 'pending' && changed));
    const notice = !!detail.fileChanges && conflict ? `<div class="notice warning">${esc(detail.resolution ?? '项目约束已变化，请核对各文件后重新整体编辑。')}</div>` : detail.applicationPending ? '<div class="notice warning">本次应用曾中断，文件可能已写入，变更留档尚待补齐。请完成记录；工作台会先核对文件，不重复覆盖。</div>' : conflict ? `<div class="notice warning">${icon('warning')} 原文或来源已变化，尚未应用这份提案。请重新核对差异。${detail.currentError ? ' '+esc(detail.currentError):''}</div><div class="conflict-grid"><div><div class="label">提案基线</div><pre>${esc(detail.baseContent ?? '文件原先不存在')}</pre></div><div><div class="label">当前原文</div><pre>${esc(detail.currentContent ?? '文件当前不存在')}</pre></div><div><div class="label">原建议</div><pre>${esc(detail.content)}</pre></div></div>` : detail.status === 'recorded' ? '<div class="notice success">已保存本次修改，前后版本与修改来由已留档。</div>' : detail.status === 'applied' ? '<div class="notice success">已写入约束，维护记录已保存。</div>' : detail.status === 'rejected' ? `<div class="notice">已拒绝：${esc(detail.rejectionReason)}</div>` : detail.status === 'superseded' ? `<div class="notice">${esc(detail.resolution ?? '这个提案已有更新版本。')}</div>` : '';
    const actions = detail.mode==='direct' ? (detail.status==='recording' || detail.applicationPending ? button('完成本次记录','retry-change',attr('id',detail.id),'primary') : detail.status==='conflict' ? '<span class="muted small">请通过 Agent / CLI 基于当前文件重新修改。</span>' : (detail.target===S.catalog.project.root+'/'+detail.file ? button('查看当前约束','change-current',attr('file',detail.file),'primary') : '')) : detail.applicationPending ? button(S.projectId === 'global' ? '完成本次变更' : '完成维护记录','retry-apply',attr('id',detail.id),'primary') : ['pending','conflict'].includes(detail.status) ? `${button('拒绝','reject-proposal',attr('id',detail.id))}${conflict ? (!!detail.fileChanges ? '<span class="muted small">请核对各文件后重新整体编辑。</span>' : button('基于当前原文重新生成','rebase-proposal',attr('id',detail.id),'primary')) : button('批准并写入','approve-proposal',attr('id',detail.id),'primary')}` : detail.status === 'applied' ? (S.projectId === 'global' ? button('查看当前约束','change-current',attr('file',detail.file),'primary') : button('查看维护记录','tab',attr('view','journal'),'primary')) : detail.replacedBy ? button('查看新提案','open-proposal',attr('id',detail.replacedBy),'primary') : '';
    content = `<div class="maintenance-backdrop" data-action="change-close" aria-hidden="true"></div><aside class="maintenance-detail change-detail" role="dialog" aria-modal="true" aria-labelledby="change-detail-title" tabindex="-1"><div class="decision-drawer-bar"><strong>${detail.mode==='direct' ? '约束迭代记录':'修改提案'}</strong>${button(icon('x'),'change-close','aria-label="关闭变更详情"','icon ghost')}</div><section class="proposal-detail decision-drawer-body"><div class="row between"><h2 id="change-detail-title">${esc(detail.title)}</h2>${badge(detail.status)}</div><div class="proposal-meta">${categoryBadge(detail)} ${esc(scopeNames[detail.scope])} · ${esc(detail.file)} · 第 ${detail.revision} 版<div class="path-line">${esc(detail.target)}</div></div>${notice}${!conflict || detail.fileChanges ? renderDiff(detail):''}<div class="reason-section"><h3>理由</h3>${esc(detail.reason)}</div><div class="reason-section"><h3>来源摘要</h3>${esc(detail.source)}</div>${detail.alternatives ? `<div class="reason-section"><h3>放弃的备选</h3>${esc(detail.alternatives)}</div>`:''}${detail.tradeoffs ? `<div class="reason-section"><h3>收益与代价</h3>${esc(detail.tradeoffs)}</div>`:''}<div class="proposal-footer"><div class="version-note">原文版本 ${esc(detail.baseHash?.slice(0,10) ?? '不存在')} · ${detail.mode==='direct' ? '记录版本':'提案版本'} ${esc(detail.contentHash.slice(0,10))}</div><div class="actions">${actions}</div></div></section></aside>`;
  }
  let month='';
  const stream=visibleItems.map(p=>{
    const date=localDate(p.createdAt); const nextMonth=date.slice(0,7);
    const label=S.changeView==='timeline' && month!==nextMonth ? `<h3 class="month-heading">${esc(nextMonth)}</h3>` : ''; month=nextMonth;
    const card=`<button class="proposal-card change-card" data-action="open-proposal" data-id="${esc(p.id)}"><div class="row between change-card-meta">${S.changeView==='list' ? `<time datetime="${esc(date)}">${esc(date)}</time>` : ''}<span class="change-card-badges">${categoryBadge(p)}${badge(p.status)}</span></div><strong>${esc(p.title)}</strong><p>${esc(p.reason)}</p><div class="path-line">${esc(p.file)}</div><span class="muted small">${p.mode==='direct' ? '直接修改 · 已保留前后版本':'提案 · 按具体版本审核'}</span></button>`;
    return label+(S.changeView==='timeline' ? `<div class="change-timeline-entry"><time class="change-timeline-date" datetime="${esc(date)}">${esc(date)}</time><span class="change-timeline-node" aria-hidden="true"></span>${card}</div>` : card);
  }).join('');
  const toolbar=`<div class="filter-bar proposal-toolbar"><div class="segments" aria-label="变更状态">${filters}</div><span class="toolbar-count">${visibleItems.length} 条</span></div>`;
  const controls=`<div class="change-controls maintenance-filters">${viewSwitcher('变更记录视图','change-view',[['timeline','迭代时间线','clock-counter-clockwise'],['list','变更清单','squares-four']],S.changeView)}<span class="muted small">每次修改保留差异、来由与来源</span><form id="change-search" class="maintenance-search"><label class="sr-only" for="change-query">搜索变更记录</label><input id="change-query" name="query" value="${esc(S.changeQuery)}" placeholder="搜索修改、文件或来由…" maxlength="200"><button class="btn icon" type="submit" aria-label="搜索变更记录">${icon('magnifying-glass')}</button></form></div>`;
  return `<div class="page proposals-page decision-board-view"><h1 class="sr-only">变更记录</h1>${toolbar}${controls}<section class="change-stream decision-panel ${S.changeView}${visibleItems.length ? ' has-events':''}">${stream || empty(S.proposalFilter==='pending' ? '暂无待审提案':'暂无变更记录','Agent / CLI 留档的变更与提案会展示在这里。')}</section>${content}</div>`;
}

async function journal(sequence) {
  const data = await api(`/api/projects/${S.projectId}/maintenance`);
  if (sequence !== renderSequence) return ''; S.maintenanceData = data; S.entries = data.entries;
  const selected = data.notes.find(note => 'note:'+note.file === S.maintenanceSelection) ?? S.catalog.docs.find(doc=>'document:'+doc.file===S.maintenanceSelection);
  S.maintenanceDocument = selected ? await api(`/api/projects/${S.projectId}/document?file=${encodeURIComponent(selected.file)}`) : null;
  if (sequence !== renderSequence) return '';
  return renderMaintenance(data,S,{esc,icon,button,badge,dropdown,markdown,empty,viewSwitcher,lexer:marked.lexer});
}

async function connection(sequence) {
  const skill = await api('/api/skill');
  if (sequence !== renderSequence) return '';
  const body = skill.content.replace(/^---\r?\n[^]*?\r?\n---(?:\r?\n|$)/,'');
  return `<div class="page skill-page"><div class="doc-toolbar"><span class="file-name" title="${esc(skill.path)}">${icon('file-text')} SKILL.md</span>${displayMode('skill-mode',S.skillRaw)}${button(icon('copy')+' 复制原文','copy',attr('text',skill.content),'small')}${button(icon('copy')+' 复制路径','copy',attr('text',skill.path),'text small')}</div><article class="skill-content">${S.skillRaw ? `<pre>${esc(skill.content)}</pre>` : markdown(body,skill.file,'__skill')}</article></div>`;
}

async function skillDetail(file) {
  const resource=await api('/api/skill?file='+encodeURIComponent(file));
  const content=/\.(?:json|xml)$/.test(file) ? `<pre class="skill-source"><code>${esc(resource.content)}</code></pre>` : markdown(resource.content,resource.file,'__skill');
  showDialog(file.split('/').pop(),`<div class="code-copy"><code>${esc(resource.path)}</code>${button('复制原文','copy',attr('text',resource.content),'small')}</div>${content}`,{drawer:true});
}

function closeDialog() { $('#dialog').close(); lastFocus?.focus?.(); }
let drawerBackdropPress = false;
function isDrawerBackdrop(event) {
  const dialog = $('#dialog');
  if (event.target !== dialog || !dialog.classList.contains('drawer')) return false;
  const bounds = dialog.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
$('#dialog').addEventListener('pointerdown',event => { drawerBackdropPress = isDrawerBackdrop(event); });
$('#dialog').addEventListener('click',event => {
  const dismiss = drawerBackdropPress && isDrawerBackdrop(event); drawerBackdropPress = false;
  if (dismiss) { event.preventDefault(); event.stopPropagation(); closeDialog(); }
});
function showDialog(title, body, { subtitle = '', wide = false, drawer = false, submit, retainOpen = false } = {}) {
  const dialog = $('#dialog'); if(!retainOpen || !dialog.open)lastFocus = document.activeElement;
  drawerBackdropPress = false;
  if (dialog.open && !retainOpen) dialog.close();
  dialog.onkeydown = null;
  dialog.className = drawer ? 'drawer' : wide ? 'wide-dialog' : '';
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>`:''}</div>${button(icon('x'),'close','aria-label="关闭"','icon ghost')}</div>${submit ? `<form id="dialog-form">${body}<div class="form-error notice error" role="alert"></div></form>` : body}</div>`;
  if (submit) dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const submitButton = form.querySelector('[type="submit"]');
    const errorNode = form.querySelector('.form-error'); errorNode.textContent = ''; if (submitButton) submitButton.disabled = true;
    try { await submit(Object.fromEntries(new FormData(form)),form); }
    catch(error) { errorNode.textContent = error.message; if (submitButton) submitButton.disabled = false; }
  };
  if(!dialog.open)dialog.showModal();
}
const field = (label, name, value = '', { textarea = false, required = false, placeholder = '', help = '', rows = 3, readonly = false, cls = '' } = {}) => `<label class="field"><span>${esc(label)}${required ? ' *':''}</span>${textarea ? `<textarea name="${name}" rows="${rows}" class="${cls}" ${required ? 'required':''}>${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" ${required ? 'required':''} ${readonly ? 'readonly':''} placeholder="${esc(placeholder)}">`}${help ? `<p class="help">${esc(help)}</p>`:''}</label>`;
const modules = ruleModules({api,showDialog,closeDialog,button,icon,esc,markdown,renderDiff,dropdown,toast,saved:()=>route('rules',{proposal:''})});
const architecture = architectureBoard({api,showDialog,closeDialog,button,icon,esc,markdown,dropdown,toast,reload:load});
const formActions = (primary, extra = '') => `<div class="modal-actions">${extra}${button('取消','close')}<button class="btn primary" type="submit">${primary}</button></div>`;

function registerProject() {
  const demoPath = S.session.demo ? `${S.session.dataDir}/demo-projects/new-project` : '';
  const layout = S.session.layout;
  const body = field('项目名称','name','',{placeholder:'例如：my-project'})+field('本地目录','root',demoPath,{required:true,placeholder:'/Users/you/Projects/my-project',help:'填写已存在目录的绝对路径。登记本身不修改项目文件。'})+`<div class="row">${button('检查目录','inspect-project','','small')}<span class="muted small" id="inspect-message">检查标准目录中的文件</span></div><div class="layout-summary"><span>项目入口 <code>${esc(layout.ruleFiles.join(' · '))}</code></span><span>约束目录 <code>${esc(layout.ruleRoots.join(' · '))}</code> · 先读 <code>index.md</code></span><span>维护日志 <code>${esc(layout.journalDir)}</code></span></div><p class="notice">按以上固定目录读取，不自动创建约束文件。</p>`+formActions('登记项目');
  showDialog('登记项目',body,{subtitle:'把一个已有项目加入工作台。',submit:async values => {
    const project = await api('/api/projects',values);
    closeDialog(); toast('项目已登记，未修改项目文件'); S.message = null; route('rules',{projectId:project.id,file:'',proposal:''});
  }});
}
const splitPaths = value => value.split(',').map(item => item.trim()).filter(Boolean);
async function inspectProject() {
  const form = $('#dialog-form'); if (!form) return;
  const label = $('#inspect-message'); label.textContent = '正在检查…';
  try { const result = await api('/api/projects/inspect',{root:form.elements.root.value}); label.textContent = '可读取 · '+(result.discovered.join(' · ') || '尚未发现约束或维护文档'); form.elements.root.classList.remove('field-error'); form.querySelector('.form-error').textContent = ''; }
  catch(error) { label.textContent = error.message; form.elements.root.classList.add('field-error'); }
}
function globalSettings() {
  const current = S.data.global ? `${S.data.global.root}/${S.data.global.file}` : '';
  showDialog('全局偏好来源',field('已有 Markdown 文件的绝对路径','file',current,{placeholder:'/Users/you/personal-rules/AGENTS.md',help:'只登记已有文件，不改写文件，也不自动修改 Agent 的配置。留空可解除映射。'})+`<p class="notice">全局偏好与项目约束分开保存。实际读取入口由你的 Agent 配置决定。</p>`+formActions('保存映射'),{submit:async values => {
    await api('/api/global',{file:values.file.trim()}); closeDialog(); toast('全局来源已更新');
    if (!values.file.trim() && S.projectId === 'global') route('rules',{projectId:S.lastProject || '',file:''}); else await load();
  }});
}
async function settings() {
  if (!S.projectId) { registerProject(); return; }
  if (S.projectId === 'global') { globalSettings(); return; }
  const project = (await api(`/api/projects/${S.projectId}`)).project;
  showDialog('目录约定',field('项目名称','name',project.name,{required:true})+`<div class="layout-summary"><span>项目入口 <code>${esc(project.ruleFiles.join(' · '))}</code></span><span>约束目录 <code>${esc(project.ruleRoots.join(' · '))}</code></span><span>维护日志 <code>${esc(project.journalDir)}</code></span></div>`+field('只读参考文档（逗号分隔）','referenceFiles',(project.referenceFiles ?? []).join(', '),{help:'只读打开契约和背景资料，不加入有效约束或自动上下文。'})+`<p class="notice">约束和维护日志使用以上固定目录；全局偏好独立配置。</p><div class="row between"><span class="muted small">${esc(project.root)}</span>${button('解除项目登记','remove-project',attr('id',project.id),'text small')}</div>`+formActions('保存设置'),{submit:async values => {
    await api(`/api/projects/${project.id}`,{...values,referenceFiles:splitPaths(values.referenceFiles)},'PATCH');
    closeDialog(); toast('项目设置已保存'); S.file = ''; await load();
  }});
}
async function removeProject(id) {
  showDialog('解除项目登记',`<p class="muted">只从工作台移除这个项目，不删除项目目录和文件。存在待审或冲突提案时，需要先处理。</p>`+formActions('解除登记'),{submit:async () => {
    await api(`/api/projects/${id}`,{},'DELETE'); closeDialog(); toast('已解除登记，项目文件保留'); route('rules',{projectId:'',file:'',proposal:''});
  }});
}

async function approve(id) {
  const detail = await api(`/api/proposals/${id}`);
  showDialog('批准并写入约束',(detail.category ? `<p>迭代标签：${categoryBadge(detail)}</p>` : categoryField('change-category'))+`<p class="muted">仅应用你刚查看的这份差异。</p><dl class="meta"><dt>文件</dt><dd class="mono">${esc(detail.file)}</dd><dt>范围</dt><dd>${scopeBadge(detail.scope)}</dd><dt>版本</dt><dd>第 ${detail.revision} 版 · ${esc(detail.contentHash.slice(0,10))}</dd></dl>${detail.fileChanges ? renderDiff(detail) : `<div class="mini-diff">${detail.changes.filter(change => change.added || change.removed).map(change => `<div class="${change.added ? 'diff-add':'diff-remove'}">${esc(change.value)}</div>`).join('')}</div>`}<p class="notice">写入前再次核对原文；有变化则停止，不覆盖当前内容。完成后留下一条维护记录。</p>`+formActions('批准并写入'),{wide:!!detail.fileChanges,submit:async values => {
    try {
      const category=detail.category || values.category; if (!categoryNames[category]) throw Error('请选择迭代标签');
      await api(`/api/proposals/${id}/apply`,{baseHash:detail.baseHash,contentHash:detail.contentHash,category}); closeDialog();
      toast('约束已写入，变更记录已保存'); S.message = {type:'success',text:`已写入 ${detail.file}。这次修改已留档。`};
      route('rules',{projectId:detail.projectId,scope:detail.scope,file:detail.file,proposal:id});
    } catch(error) {
      if (error.status === 409) { closeDialog(); S.message = {type:'warning',text:error.message}; await load(); toast(error.message,true); }
      else throw error;
    }
  }});
}
async function reject(id) {
  const detail = await api(`/api/proposals/${id}`);
  showDialog('拒绝提案',`<p><strong>${esc(detail.title)}</strong></p><p class="mono small muted">${esc(detail.file)}</p>`+field('拒绝原因','reason','',{textarea:true,required:true,placeholder:'为后续查阅保留判断依据，避免反复提出同一建议。'})+`<p class="notice">拒绝不会修改约束文件，原因将随提案保留。</p>`+formActions('确认拒绝'),{submit:async values => {
    await api(`/api/proposals/${id}/reject`,values); closeDialog(); toast('已拒绝提案，未修改约束'); route('proposals',{proposalFilter:'rejected'});
  }});
}
async function rebase(id) {
  const detail=await api(`/api/proposals/${id}`);
  showDialog('基于当前原文重新生成',categoryField('change-category',detail.category ?? '')+`<p class="muted">保留原提案记录，用当前文件作为新基线。生成后仍需查看差异并审核；不会自动合并或批准。</p>`+formActions('生成新的待审提案'),{submit:async values => {
    if (!categoryNames[values.category]) throw Error('请选择迭代标签');
    const result = await api(`/api/proposals/${id}/rebase`,{category:values.category}); closeDialog(); S.message = null;
    toast(result.noChanges ? '当前文件已包含全部建议，无剩余差异':'新提案已生成，请重新审核');
    S.proposalFilter = result.noChanges ? 'all':'pending'; route('proposals',{proposal:result.id});
  }});
}

async function documentDetail(projectId,file) {
  const catalog = await api(`/api/projects/${projectId}`); const doc = catalog.docs.find(item => item.file === file);
  const result = await api(`/api/projects/${projectId}/document?file=${encodeURIComponent(file)}`);
  if (S.view==='journal' && S.maintenanceSelection && projectId===S.projectId) return openMaintenance(doc?.role==='decision' ? 'note':'document',file);
  const backlinks = catalog.docs.filter(item => item.file !== file && (item.title === file || item.file === result.supersededBy));
  showDialog(doc?.role === 'decision' ? '工程决策详情':'文档详情',`${doc ? `<div class="row wrap">${badge(doc.status)}${doc.category ? `<span class="pill">${esc(categoryNames[doc.category] ?? doc.category)}</span>`:''}</div>`:''}<div class="code-copy"><code>${esc(file)}</code>${button('复制路径','copy',attr('text',file),'small')}</div>${markdown(result.content,file,projectId,doc?.role === 'decision')}${backlinks.length ? '<h3>关联文档</h3>'+backlinks.map(item => button(esc(item.title),'document',`${attr('file',item.file)} ${attr('project',projectId)}`,'text doc-link')).join(''):''}`,{drawer:true});
}
function entryDetail(entry,projectId = S.projectId) {
  showDialog('维护记录详情',`<div class="code-copy"><code>${esc(entry.file)}</code>${button('复制路径','copy',attr('text',entry.file),'small')}</div>${markdown(entry.content,entry.file,projectId)}`,{drawer:true});
}
async function searchDialog() {
  if (!S.projectId) return;
  if (S.projectId === 'global' && S.searchKind === 'journal') S.searchKind='all';
  showDialog(S.projectId === 'global' ? '搜索全局偏好' : '搜索当前项目',`<label class="field"><span class="label">搜索词</span><input id="search-query" placeholder="输入关键词，如：保留修改" autocomplete="off"></label><div class="segments" id="search-kinds">${[['all','全部'],['document','文档'],['proposal','提案'],...(S.projectId === 'global' ? [] : [['journal','维护']])].map(([kind,label]) => `<button class="segment ${S.searchKind === kind ? 'active':''}" type="button" data-action="search-kind" data-kind="${kind}">${label}</button>`).join('')}</div><div id="search-results" aria-live="polite"><p class="muted small">搜索已登记的当前项目，不读取其他项目或历史会话。</p></div><div class="status-caption">Enter 打开首项 · Esc 关闭</div>`,{wide:true});
  let timer; let generation = 0;
  const query = $('#search-query');
  S.runSearch = async () => {
    const current = ++generation; const resultNode = $('#search-results'); if (!resultNode) return;
    resultNode.innerHTML = '<p class="muted small">正在搜索…</p>';
    try {
      const result = await api(`/api/projects/${S.projectId}/search?q=${encodeURIComponent(query.value)}&kind=${S.searchKind}`);
      if (current !== generation || !$('#search-results')) return;
      resultNode.innerHTML = result.hits.map(hit => `<button type="button" class="proposal-card" data-action="search-result" data-kind="${esc(hit.kind)}" data-id="${esc(hit.proposalId ?? '')}" data-file="${esc(hit.file)}"><strong>${esc(hit.title)}</strong><div class="path-line">${esc(hit.file)} ${hit.status ? ' · '+esc(statusNames[hit.status]):''}</div><span class="muted small">${esc(hit.excerpt)}</span></button>`).join('') || `<p class="muted small">${query.value.trim() ? '没有匹配结果。可以换一个关键词。':'输入关键词开始搜索。'}</p>`;
      if (result.truncated || result.warnings.length) resultNode.innerHTML += '<p class="notice warning">部分结果未展示，请缩小关键词范围；文档扫描也可能达到上限。</p>';
    } catch(error) { if (current === generation && $('#search-results')) resultNode.innerHTML = `<p class="notice error">${esc(error.message)}</p>`; }
  };
  query.oninput = () => { clearTimeout(timer); timer = setTimeout(S.runSearch,220); };
  $('#dialog').onkeydown = event => {
    if (['ArrowDown','ArrowUp'].includes(event.key) && event.target.closest('#search-results')) {
      const nodes = [...document.querySelectorAll('#search-results button')]; const index = nodes.indexOf(event.target.closest('button'));
      event.preventDefault(); const next = index + (event.key === 'ArrowDown' ? 1 : -1); if (next < 0) query.focus(); else nodes[Math.min(next,nodes.length-1)]?.focus();
    }
  };
  query.onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); $('#search-results button')?.click(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); $('#search-results button')?.focus(); }
  };
  query.focus();
}

function openMaintenance(kind,key) {
  if (!S.maintenanceSelection) { lastMaintenanceFocus={kind,key};maintenanceOriginScroll={x:scrollX,y:scrollY}; }
  return route('journal',{maintenanceSelection:kind+':'+key,maintenanceFormat:'read'});
}
function scrollMaintenanceAnchor(anchor) {
  const normalize=value=>value.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,'-');
  const detail=$('.maintenance-detail');if(!detail)return;
  const target=[...detail.querySelectorAll('[data-source-heading],h1,h2,h3,h4,h5,h6')].find(node=>normalize(node.dataset.sourceHeading || node.textContent)===normalize(anchor));
  if(target)target.scrollIntoView({block:'start'});else toast('当前文档未找到这个段落');
}
async function action(target) {
  const { action: name } = target.dataset;
  if (name?.startsWith('architecture-')) return architecture.action(target);
  if (name === 'dropdown-toggle') {
    const control = target.closest('.custom-select');
    if (target.getAttribute('aria-expanded') === 'true') closeDropdowns(true); else openDropdown(control);
    return;
  }
  if (name === 'dropdown-option') {
    const id = target.closest('.custom-select').id; const value = target.dataset.value;
    closeDropdowns(true);
    if (id.startsWith('architecture-')) return architecture.choose(id,value);
    if (id === 'constraint-template') return modules.selectTemplate(value);
    if (id.startsWith('constraint-config-')) return modules.selectConfiguration(id.slice('constraint-config-'.length),value);
    if (id === 'constraint-directory') return modules.selectDirectory(value);
    if (id === 'record-category' || id === 'change-category' || id === 'module-category') { const control = target.closest('.custom-select'); control.querySelector('.dropdown-trigger span').textContent = target.querySelector('.option-label').textContent; control.querySelectorAll('[role=option]').forEach(option=>option.setAttribute('aria-selected',String(option===target))); $('#dialog input[name=category]').value=value; return; }
    const filterFields = {'month-filter':'month','maintenance-category':'maintenanceCategory','maintenance-status':'noteStatus','maintenance-sort':'maintenanceSort'};
    if (filterFields[id]) { focusSelectAfterRender=id; return route('journal',{[filterFields[id]]:value}); }
    if (value === '__register') return registerProject();
    if (value === '__global' && !S.data.global) return globalSettings();
    focusSelectAfterRender = id;
    if (value === '__global') return action({dataset:{action:'global'}});
    if (value === '__connect') return route('connect');
    return route('rules',{projectId:value,file:''});
  }
  if (name === 'close') return closeDialog();
  if (name === 'refresh') { S.message = null; return load(); }
  if (name === 'register') return registerProject();
  if (name === 'edit-constraints') return modules.open(sourceId());
  if (name === 'inspect-project') return inspectProject();
  if (name === 'project') { S.message = null; return route('rules',{projectId:target.dataset.id,file:'',proposal:''}); }
  if (name === 'tab') { S.message = null; return route(target.dataset.view,{proposal:''}); }
  if (name === 'connect') return route('connect');
  if (name === 'skill-mode' || name === 'read-mode') {
    const mode = target.dataset.mode === 'raw' ? 'raw' : 'read';
    S[name === 'skill-mode' ? 'skillRaw' : 'raw'] = mode === 'raw';
    await load();
    document.querySelector(`.display-mode [data-action="${name}"][data-mode="${mode}"]`)?.focus({preventScroll:true});
    return;
  }
  if (name === 'global') { if (!S.data.global) return globalSettings(); return route('rules',{projectId:'global',file:''}); }
  if (name === 'folder') {
    const directory = target.closest('details'); directory.open = !directory.open;
    const key = folderKey(directory.dataset.directory);
    if (directory.open) collapsedFolders.delete(key); else collapsedFolders.add(key);
    return;
  }
  if (name === 'file') return route('rules',{file:target.dataset.file});
  if (name === 'settings') return settings();
  if (name === 'remove-project') return removeProject(target.dataset.id);
  if (name === 'change-close') { lastChangeFocus=S.proposal; restoreChangeFocus=true; return route('proposals',{proposal:''}); }
  if (name === 'change-view') { focusViewAfterRender={action:name,view:target.dataset.view}; return route('proposals',{changeView:target.dataset.view,proposal:''}); }
  if (name === 'change-current') return route('rules',{file:target.dataset.file,proposal:''});
  if (name === 'retry-change') { await api(`/api/changes/${target.dataset.id}/retry`,{}); toast('修改记录已补齐'); return load(); }
  if (name === 'open-proposal') { const p = S.data.proposals.find(item => item.id === target.dataset.id); S.message = null; return route('proposals',{projectId:p?.projectId ?? S.projectId,proposal:target.dataset.id}); }
  if (name === 'proposal-filter') return route('proposals',{proposalFilter:target.dataset.filter,proposal:''});
  if (name === 'approve-proposal') return approve(target.dataset.id);
  if (name === 'retry-apply') { const p = await api(`/api/proposals/${target.dataset.id}`); await api(`/api/proposals/${p.id}/apply`,{baseHash:p.baseHash,contentHash:p.contentHash}); toast('应用记录已完成'); return load(); }
  if (name === 'reject-proposal') return reject(target.dataset.id);
  if (name === 'rebase-proposal') return rebase(target.dataset.id);
  if (name === 'maintenance-view') { focusViewAfterRender={action:name,view:target.dataset.view}; return route('journal',{maintenanceView:target.dataset.view,maintenanceSelection:''}); }
  if (name === 'maintenance-open') return openMaintenance(target.dataset.kind,target.dataset.key);
  if (name === 'maintenance-close' || name === 'maintenance-dismiss') { focusMaintenanceAfterRender=true; return route('journal',{maintenanceSelection:''}); }
  if (name === 'maintenance-reset') return route('journal',{...maintenanceDefaults,maintenanceView:S.maintenanceView});
  if (name === 'maintenance-raw') return route('journal',{maintenanceFormat:S.maintenanceFormat==='raw' ? 'read':'raw'});
  if (name === 'log-mode') return route('journal',{maintenanceView:target.dataset.mode==='decision' ? 'list':'timeline'});
  if (name === 'note-status') { S.noteStatus = target.dataset.status; return load(); }
  if (name === 'reset-logs') { S.month = ''; S.noteStatus = 'all'; return load(); }
  if (name === 'entry-detail') return entryDetail(S.entries[Number(target.dataset.index)]);
  if (name === 'log-preview') { const entries = await api(`/api/projects/${target.dataset.project}/journal`); return entryDetail(entries[Number(target.dataset.index)],target.dataset.project); }
  if (name === 'document') return documentDetail(target.dataset.project ?? S.projectId,target.dataset.file);
  if (name === 'search') return searchDialog();
  if (name === 'search-kind') { S.searchKind = target.dataset.kind; $('#search-kinds').querySelectorAll('button').forEach(node => node.classList.toggle('active',node.dataset.kind === S.searchKind)); return S.runSearch(); }
  if (name === 'search-result') { closeDialog(); if (target.dataset.kind === 'proposal') return action({...target,dataset:{action:'open-proposal',id:target.dataset.id}}); return documentDetail(S.projectId,target.dataset.file); }
  if (name === 'later') return toast('提案仍保留在待审队列，可随时回来处理');
  if (name === 'copy') { await navigator.clipboard.writeText(target.dataset.text); return toast('已复制'); }
  if (name === 'local') return showDialog('本地文件',`<p class="muted small">正式内容保存在项目目录，工作台仅保存来源映射、待审提案与应用回执。</p><div class="code-copy"><code>${esc(S.session.dataDir)}</code>${button('复制路径','copy',attr('text',S.session.dataDir),'small')}</div><p class="notice">此目录是本机状态，不应提交到 Git。关闭看板后，项目 Markdown 仍可直接读取。</p>`);
}

document.addEventListener('keydown',event=>{
  const detail=document.querySelector('.maintenance-detail[aria-modal=true]');
  if (!detail || event.key!=='Tab' || $('#dialog').open) return;
  const elements=[...detail.querySelectorAll('button,a[href],input,[tabindex="0"]')].filter(node=>node.getClientRects().length);
  if (!elements.length) return;
  if (event.shiftKey && (document.activeElement===elements[0] || document.activeElement===detail)) { event.preventDefault();elements.at(-1).focus(); }
  else if (!event.shiftKey && (document.activeElement===elements.at(-1) || document.activeElement===detail)) { event.preventDefault();elements[0].focus(); }
});
document.addEventListener('toggle',event=>{const folder=event.target;if(folder.matches?.('details[data-constraint-folder]'))modules.rememberFolder(folder.dataset.project,folder.dataset.constraintFolder,folder.open);},true);
document.addEventListener('submit',event=>{ if (event.target.id !== 'maintenance-search') return; event.preventDefault(); route('journal',{maintenanceQuery:new FormData(event.target).get('query').trim().slice(0,200),maintenanceSelection:''}); });
document.addEventListener('submit',event=>{ if (event.target.id!=='change-search') return; event.preventDefault(); route('proposals',{changeQuery:new FormData(event.target).get('query').trim().slice(0,200),proposal:''}); });
document.addEventListener('keydown',event=>{ if (event.key==='Escape' && !$('#dialog').open && S.view==='proposals' && S.proposal) { event.preventDefault(); action({dataset:{action:'change-close'}}); } });
document.addEventListener('keydown',event=>{ if (event.key==='Escape' && !$('#dialog').open && S.view==='journal' && S.maintenanceSelection && !event.target.closest('.custom-select')) { event.preventDefault(); focusMaintenanceAfterRender=true; route('journal',{maintenanceSelection:''}); } });
document.addEventListener('click',async event => {
  const target = event.target.closest('[data-action]');
  if (target) { event.preventDefault(); if (target.disabled) return; try { await action(target); } catch(error) { toast(error.message,true); } return; }
  const link = event.target.closest('.markdown a');
  if (!link) return;
  const href = link.getAttribute('href') ?? ''; if (/^https?:\/\//.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; return; }
  if (href.startsWith('#') && link.closest('.maintenance-detail')) { event.preventDefault(); try {scrollMaintenanceAnchor(decodeURIComponent(href.slice(1)));}catch{toast('段落链接格式无效',true);} return; }
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return;
  event.preventDefault();
  const container = link.closest('.markdown');
  const file = decodeURIComponent(new URL(href,`http://workbench/${container.dataset.file}`).pathname.slice(1));
  try {
    if (container.dataset.project === '__skill') return await skillDetail(file);
    const anchor=new URL(href,'http://workbench/'+container.dataset.file).hash.slice(1);
    if(link.closest('.maintenance-detail') && file===container.dataset.file && anchor) return scrollMaintenanceAnchor(decodeURIComponent(anchor));
    if(link.closest('.maintenance-detail') && anchor) maintenanceAnchor=decodeURIComponent(anchor);
    await documentDetail(container.dataset.project || S.projectId,file);
  } catch(error) { maintenanceAnchor='';toast(error.message,true); }
});
document.addEventListener('pointerdown',event => { if (!event.target.closest('.custom-select')) closeDropdowns(); });
document.addEventListener('keydown',event => {
  const control = event.target.closest('.custom-select'); if (!control) return;
  const trigger = control.querySelector('.dropdown-trigger'); const open = trigger.getAttribute('aria-expanded') === 'true';
  const keys = ['ArrowDown','ArrowUp','Home','End'];
  if (keys.includes(event.key)) {
    event.preventDefault();
    if (!open) { openDropdown(control,event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined); return; }
    const options = [...control.querySelectorAll('[role=option]')]; const current = options.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (current+(event.key === 'ArrowDown' ? 1 : -1)+options.length)%options.length;
    options[index]?.focus();
  } else if (open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeDropdowns(true); }
  else if (open && event.key === 'Tab') closeDropdowns(true);
});
document.addEventListener('keydown',event => {
  if (event.key === '/' && !S.maintenanceSelection && !event.target.closest('.custom-select') && !$('#dialog').open && !event.target.matches('input,textarea,select')) { event.preventDefault(); searchDialog(); }
});
$('#dialog').addEventListener('cancel',() => setTimeout(() => lastFocus?.focus?.(),0));
window.addEventListener('hashchange',load);
window.addEventListener('resize',keepSelectedFileVisible);
window.addEventListener('focus',() => { if (S.session && !$('#dialog').open) load(); });
try { S.session = await api('/api/session'); await load(); }
catch(error) { $('#app').innerHTML = `<div class="page"><h1>无法连接工作台</h1><p>${esc(error.message)}</p><p>启动本机服务后刷新页面。</p></div>`; }
