import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const button = (label, action, attributes = '', classes = '') => `<button type="button" class="btn ${classes}" data-action="${action}" ${attributes}>${label}</button>`;
const statusNames = {pending:'待审',applied:'已写入',rejected:'已拒绝',conflict:'冲突',superseded:'已替代',implemented:'已落地',proposed:'方案稿',archived:'已归档',current:'当前文档'};
const categoryNames = {architecture:'架构',feature:'功能', 'bug-fix':'缺陷修复',simplification:'简化',process:'流程',testing:'验证'};
const scopeNames = {global:'全局',project:'项目',module:'模块'};
const badge = status => `<span class="pill ${esc(status)}">${esc(statusNames[status] ?? status)}</span>`;
const scopeBadge = scope => `<span class="pill">${esc(scopeNames[scope] ?? scope)}</span>`;
const plain = content => String(content ?? '').replace(/<!--[^]*?-->/g,'').replace(/^#{1,6}\s.*$/gm,'').replace(/[*`]/g,'').trim();
function markdown(content, file = '', projectId = '', decision = false) {
  const renderer = new marked.Renderer();
  renderer.html = ({text}) => esc(text);
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
const S = {session:null,data:null,projectId:'',view:'rules',scope:'project',file:'',proposal:'',raw:false,proposalFilter:'pending',logMode:'journal',month:'',noteStatus:'all',searchKind:'all',lastProject:'',message:null};
let renderSequence = 0; let lastFocus; let toastTimeout;

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
  Object.assign(S,options,{view});
  const hash = new URLSearchParams({project:S.projectId,view,scope:S.scope,file:S.file,proposal:S.proposal}).toString();
  if (location.hash.slice(1) === hash) load(); else location.hash = hash;
}
function readRoute() {
  const values = new URLSearchParams(location.hash.slice(1));
  for (const [field,key] of [['projectId','project'],['view','view'],['scope','scope'],['file','file'],['proposal','proposal']]) if (values.has(key)) S[field] = values.get(key);
  if (!['overview','rules','proposals','journal','connect'].includes(S.view)) S.view = 'rules';
  if (!['project','module','global'].includes(S.scope)) S.scope = 'project';
}
function sourceId() { return S.scope === 'global' || S.projectId === 'global' ? 'global' : S.projectId; }
function pending(id = S.projectId) { return S.data.proposals.filter(p => p.projectId === id && ['pending','conflict'].includes(p.status)); }
function activeProject() { return S.projectId === 'global' ? {name:'全局偏好',root:S.data.global ? `${S.data.global.root}/${S.data.global.file}` : '',id:'global'} : S.data.projects.find(p => p.id === S.projectId); }
function shell(content) {
  const project = activeProject();
  const projectButtons = S.data.projects.map(p => `<button class="project-button ${S.projectId === p.id ? 'active' : ''}" data-action="project" data-id="${esc(p.id)}">${icon('folder')}<span>${esc(p.name)}</span>${pending(p.id).length ? `<span class="pill pending">${pending(p.id).length}</span>` : ''}</button>`).join('');
  const tabs = [['overview','总览'],['rules','约束'],['proposals','提案'],['journal','维护记录']].map(([id,label]) => `<button class="tab ${S.view === id ? 'active' : ''}" data-action="tab" data-view="${id}" aria-current="${S.view === id ? 'page' : 'false'}">${label}${id === 'proposals' && pending().length ? `<span class="count">${pending().length}</span>` : ''}</button>`).join('');
  $('#app').innerHTML = `<aside class="sidebar"><div class="brand"><span class="brand-mark">${icon('brackets-curly')}</span>agent-workbench</div><div class="project-label">项目 <span>${S.data.projects.length}</span></div><div class="projects">${projectButtons || '<p class="muted small">尚未登记项目</p>'}</div>${button(icon('plus')+' 登记项目','register','','register')}<div class="sidebar-bottom"><button class="project-button ${S.projectId === 'global' ? 'active':''}" data-action="global">${icon('gear-six')}<span>全局偏好</span></button><button class="project-button ${S.view === 'connect' ? 'active':''}" data-action="connect">${icon('plugs')}<span>Skill 接入</span></button><button class="project-button" data-action="local">${icon('folder-open')}<span>本地文件</span></button></div><div class="local-note">LOCAL · FILES FIRST · v0.1</div><select class="mobile-project" aria-label="切换项目"><option value="">选择项目</option><option value="__register">登记项目…</option><option value="__global">全局偏好</option><option value="__connect">Skill 接入</option>${S.data.projects.map(p => `<option value="${esc(p.id)}" ${S.projectId === p.id ? 'selected':''}>${esc(p.name)}</option>`).join('')}</select></aside><main class="app-main"><header class="header"><div class="header-top"><h1>${esc(project?.name ?? '我的项目')}</h1><span class="root-path" title="${esc(project?.root)}">${esc(project?.root ?? '登记项目后开始使用')}</span><button class="btn header-search" data-action="search" ${!project ? 'disabled':''}>${icon('magnifying-glass')}<span class="search-text">搜索文档与提案</span><span class="key">/</span></button>${button(icon('gear-six'),'settings','aria-label="文档来源设置" title="文档来源设置"','icon')}</div><nav class="tabs" aria-label="项目页面">${tabs}</nav></header>${S.session.demo ? '<div class="demo-bar">演示工作区 · 示例文件与正式数据隔离 · 本次修改仅作用于演示目录</div>':''}${S.message ? `<div class="page"><div class="notice ${esc(S.message.type ?? 'success')}">${esc(S.message.text)}</div></div>`:''}${content}</main>`;
}
function empty(title, description, actions = '', glyph = 'files') { return `<div class="empty">${icon(glyph)}<h2>${esc(title)}</h2><p>${esc(description)}</p><div class="actions">${actions}</div></div>`; }

async function load() {
  const sequence = ++renderSequence; readRoute();
  try {
    const data = await api('/api/state'); if (sequence !== renderSequence) return; S.data = data;
    if (S.projectId !== 'global' && !S.data.projects.some(p => p.id === S.projectId)) S.projectId = S.data.projects[0]?.id ?? '';
    if (S.projectId === 'global' && !S.data.global) S.projectId = S.data.projects[0]?.id ?? '';
    if (S.projectId && S.projectId !== 'global') S.lastProject = S.projectId;
    if (!S.projectId && S.view !== 'connect') S.view = 'overview';
    let content;
    if (S.view === 'overview') content = overview();
    if (S.view === 'connect') content = connection();
    if (['rules','proposals','journal'].includes(S.view)) {
      const catalog = await api(`/api/projects/${S.projectId}`); if (sequence !== renderSequence) return; S.catalog = catalog;
      if (S.view === 'rules') content = await rules(sequence);
      if (S.view === 'proposals') content = await proposals(sequence);
      if (S.view === 'journal') content = await journal(sequence);
    }
    if (sequence !== renderSequence) return;
    shell(content);
  } catch(error) {
    if (sequence !== renderSequence) return;
    if (S.data) shell(`<div class="page"><div class="notice error">${esc(error.message)}</div><div class="actions">${button('重试读取','refresh')}</div></div>`);
    else $('#app').innerHTML = `<div class="page"><h1>无法读取本地工作区</h1><p>${esc(error.message)}</p>${button('重试','refresh')}</div>`;
    toast(error.message,true);
  }
}

function overview() {
  const rows = S.data.projects.map(p => `<tr><td>${button(esc(p.name),'project',attr('id',p.id),'text')}<div class="path-line">${esc(p.root)}</div></td><td class="source-cell">${esc(p.ruleFiles.join(' · '))}</td><td>${pending(p.id).length ? `<span class="pill pending">${pending(p.id).length} 条</span>` : '<span class="muted">—</span>'}</td><td class="action-cell">${button('查看约束','project',attr('id',p.id),'small')}</td></tr>`).join('');
  return `<div class="page"><div class="page-title"><div><h1>项目总览</h1><p>约束与维护来由，留在项目文件里。</p></div>${button(icon('plus')+' 登记项目','register','','primary')}</div>${S.data.warnings?.map(w => `<p class="notice warning">${esc(w)}</p>`).join('') ?? ''}${rows ? `<table class="table"><thead><tr><th>项目</th><th class="source-cell">约束入口</th><th>待审</th><th class="action-cell"></th></tr></thead><tbody>${rows}</tbody></table><p class="status-caption">目录由你主动登记；工作台不会遍历磁盘或自动修改项目。</p>` : empty('从一个项目开始','登记已有的本机目录，直接查看项目中的 AGENTS.md、模块说明与维护记录。',button(icon('folder-plus')+' 登记第一个项目','register','','primary'))}</div>`;
}
async function rules(sequence) {
  const id = sourceId();
  const catalog = id === S.projectId ? S.catalog : await api(`/api/projects/${id}`);
  if (sequence !== renderSequence) return '';
  const documents = catalog.docs.filter(d => d.role === 'rule' && (id === 'global' || d.scope === S.scope));
  if (!documents.some(d => d.file === S.file)) S.file = documents[0]?.file ?? (S.scope === 'module' ? `${catalog.project.ruleRoots[0] ?? 'docs/agent'}/module.md` : catalog.project.ruleFiles[0]);
  const document = await api(`/api/projects/${id}/document?file=${encodeURIComponent(S.file)}`); if (sequence !== renderSequence) return ''; S.document = document;
  const fileButtons = documents.map(d => `<button class="file-button ${d.file === S.file ? 'active':''}" data-action="file" data-file="${esc(d.file)}">${icon('file-text')}<span>${esc(d.file.split('/').pop())}${d.superseded ? ' · 已替代':''}${d.file.includes('/') ? `<small>${esc(d.file.slice(0,d.file.lastIndexOf('/')))}</small>` : ''}</span></button>`).join('');
  const scopes = ['global','project','module'].map(scope => `<button class="segment ${S.scope === scope ? 'active':''}" data-action="scope" data-scope="${scope}">${scopeNames[scope]}</button>`).join('');
  const proposal = pending(id).find(p => p.file === S.file) ?? pending(id)[0];
  let inspector;
  if (proposal) {
    const detail = await api(`/api/proposals/${proposal.id}`); if (sequence !== renderSequence) return '';
    inspector = `<div class="row between"><h2>待审提案</h2>${badge(proposal.status)}</div><h3>${esc(proposal.title)}</h3><dl class="meta"><dt>范围</dt><dd>${scopeBadge(proposal.scope)}</dd><dt>来源</dt><dd>${esc(proposal.source)}</dd></dl><hr><span class="label">差异摘要</span><div class="mini-diff">${detail.changes.filter(c => c.added || c.removed).slice(0,4).map(c => `<div class="${c.added ? 'diff-add':'diff-remove'}">${c.added ? '+':'−'} ${esc(c.value.slice(0,180))}</div>`).join('')}</div><div class="actions">${button('审核差异','open-proposal',attr('id',proposal.id),'primary')}${button('稍后处理','later')}</div><p class="muted small">批准具体差异后，才会写入约束。</p>`;
  } else inspector = `<h2>当前约束</h2><p class="muted small">${id === 'global' ? '全局偏好独立保存，项目按需引用。':'正式内容保存在原始文件中。'}</p><dl class="meta"><dt>范围</dt><dd>${scopeBadge(id === 'global' ? 'global':S.scope)}</dd><dt>文件</dt><dd class="mono">${esc(S.file)}</dd></dl>${button(icon('pencil-simple')+' 提出修改','new-proposal','','primary')}<hr><p class="muted small">约束变更通过提案审核。维护日志与历史决定不自动变成有效指令。</p>`;
  const logs = (await api(`/api/projects/${id}/journal`)).slice(0,2); if (sequence !== renderSequence) return '';
  const decisions = catalog.docs.filter(d => d.role === 'decision' && d.status === 'implemented').slice(0,2);
  const selected = documents.find(doc => doc.file === S.file);
  const lineage = selected?.superseded ? `<p class="notice warning">此说明已被替代，不作为当前有效约束。${selected.supersededBy ? ' '+button('查看替代文档','document',`${attr('file',selected.supersededBy)} ${attr('project',id)}`,'text small') : ''}</p>` : '';
  const content = !S.document.exists ? empty('还没有这份约束','可以先通过提案创建入口，审核前不会写入文件。',button('创建入口提案','new-proposal','','primary'),'file-plus') : S.raw ? `<pre>${esc(S.document.content)}</pre>` : markdown(S.document.content,S.file,id);
  return `<div class="workspace"><aside class="file-rail"><div class="segments">${scopes}</div><div class="file-heading">${scopeNames[S.scope]}文档</div><div class="rail-path">${S.scope === 'module' ? esc(catalog.project.ruleRoots.join(' · ')) : 'AGENT INSTRUCTIONS'}</div><div class="file-list">${fileButtons || '<p class="muted small">尚无文档</p>'}</div>${button(icon('plus')+' 新建约束提案','new-proposal','','text small')}</aside><article class="reader"><div class="doc-toolbar"><span class="file-name">${icon('file-text')} ${esc(S.file)}</span>${button('阅读','read-mode',attr('mode','read'),S.raw ? '' : 'primary')}${button('原文','read-mode',attr('mode','raw'),S.raw ? 'primary' : '')}${button(icon('pencil-simple')+' 提出修改','new-proposal','','text')}</div>${catalog.warnings.map(w => `<p class="notice warning">${esc(w.message)}</p>`).join('')}${lineage}${content}<section class="related-log"><h2>相关维护</h2>${logs.length ? `<div class="mini-timeline">${logs.map((entry,index) => `<button data-action="log-preview" data-index="${index}" data-project="${esc(id)}">${esc(entry.title.replace(/^\d{4}-\d{2}-\d{2}\s*[·—-]?\s*/,''))}</button>`).join('')}</div>` : '<p class="muted small">尚无维护记录。</p>'}${button('查看维护路径 '+icon('arrow-up-right'),'tab',attr('view','journal'),'text small')}</section><div class="source-footer">原始文件 · ${esc(catalog.project.root)}/${esc(S.file)}</div></article><aside class="inspector">${inspector}${decisions.length ? `<hr><h3>相关决定</h3>${decisions.map(d => button(esc(d.title),'document',`${attr('file',d.file)} ${attr('project',id)}`,'text doc-link')).join('')}`:''}</aside></div>`;
}

function renderDiff(detail) {
  let left = 0; let right = 0;
  const column = added => detail.changes.filter(change => added ? !change.removed : !change.added).map(change => {
    const lines = change.value.replace(/\n$/,'').split('\n');
    return lines.map(text => `<div class="diff-line ${change.added ? 'diff-add' : change.removed ? 'diff-remove':''}"><span class="line-num">${added ? ++right : ++left}</span><span>${esc(text) || ' '}</span></div>`).join('');
  }).join('');
  return `<div class="diff-grid"><div class="diff-column"><div class="diff-heading">当前内容（提案基线）</div><div class="diff-body">${column(false) || '<div class="diff-line muted">文件尚不存在</div>'}</div></div><div class="diff-column"><div class="diff-heading">建议内容（第 ${detail.revision} 版）</div><div class="diff-body">${column(true)}</div></div></div>`;
}
async function proposals(sequence) {
  const all = S.data.proposals.filter(p => p.projectId === S.projectId);
  const filtered = all.filter(p => S.proposalFilter === 'all' || S.proposalFilter === 'pending' ? S.proposalFilter === 'all' || ['pending','conflict'].includes(p.status) : p.status === S.proposalFilter);
  if (!filtered.some(p => p.id === S.proposal)) S.proposal = filtered[0]?.id ?? '';
  const filters = [['pending','待审'],['applied','已写入'],['rejected','已拒绝'],['all','全部']].map(([id,label]) => `<button class="segment ${S.proposalFilter === id ? 'active':''}" data-action="proposal-filter" data-filter="${id}">${label}</button>`).join('');
  let content;
  if (!S.proposal) content = empty(S.proposalFilter === 'pending' ? '暂无待审提案' : '这里还没有记录','不需要为了留档而创建新规则；有值得保留的修改建议时，再提交审核。',button('新建提案','new-proposal','','primary')+button('查看已处理记录','proposal-filter',attr('filter','all')),'file-text');
  else {
    const detail = await api(`/api/proposals/${S.proposal}`); if (sequence !== renderSequence) return ''; S.proposalDetail = detail;
    const changed = detail.currentError || detail.currentContent !== detail.baseContent;
    const conflict = !detail.applicationPending && (detail.status === 'conflict' || (detail.status === 'pending' && changed));
    const notice = detail.applicationPending ? '<div class="notice warning">本次应用曾中断，文件可能已写入，维护记录尚待补齐。请完成记录；工作台会先核对文件，不重复覆盖。</div>' : conflict ? `<div class="notice warning">${icon('warning')} 原文或来源已变化，尚未应用这份提案。请重新核对差异。${detail.currentError ? ' '+esc(detail.currentError):''}</div><div class="conflict-grid"><div><div class="label">提案基线</div><pre>${esc(detail.baseContent ?? '文件原先不存在')}</pre></div><div><div class="label">当前原文</div><pre>${esc(detail.currentContent ?? '文件当前不存在')}</pre></div><div><div class="label">原建议</div><pre>${esc(detail.content)}</pre></div></div>` : detail.status === 'applied' ? '<div class="notice success">已写入约束，维护记录已保存。</div>' : detail.status === 'rejected' ? `<div class="notice">已拒绝：${esc(detail.rejectionReason)}</div>` : detail.status === 'superseded' ? `<div class="notice">${esc(detail.resolution ?? '这个提案已有更新版本。')}</div>` : '';
    const actions = detail.applicationPending ? button('完成维护记录','retry-apply',attr('id',detail.id),'primary') : ['pending','conflict'].includes(detail.status) ? `${detail.status === 'pending' ? button('编辑提案','edit-proposal',attr('id',detail.id)) : ''}${button('拒绝','reject-proposal',attr('id',detail.id))}${conflict ? button('基于当前原文重新生成','rebase-proposal',attr('id',detail.id),'primary') : button('批准并写入','approve-proposal',attr('id',detail.id),'primary')}` : detail.status === 'applied' ? button('查看维护记录','tab',attr('view','journal'),'primary') : detail.replacedBy ? button('查看新提案','open-proposal',attr('id',detail.replacedBy),'primary') : '';
    content = `<div class="proposal-workspace"><aside class="proposal-list"><span class="label">${filtered.length} 条记录</span>${filtered.map(p => `<button class="proposal-card ${p.id === S.proposal ? 'active':''}" data-action="open-proposal" data-id="${esc(p.id)}"><strong>${esc(p.title)}</strong><div class="row wrap">${badge(p.status)}<small>${esc(p.createdAt.slice(0,10))}</small></div><div class="path-line">${esc(p.file)}</div></button>`).join('')}</aside><section class="proposal-detail"><div class="row between"><h2>${esc(detail.title)}</h2>${badge(detail.status)}</div><div class="proposal-meta">${esc(scopeNames[detail.scope])} · ${esc(detail.file)} · 第 ${detail.revision} 版</div>${notice}${!conflict ? renderDiff(detail):''}<div class="reason-section"><h3>理由</h3>${esc(detail.reason)}</div><div class="reason-section"><h3>来源摘要</h3>${esc(detail.source)}</div>${detail.alternatives ? `<div class="reason-section"><h3>放弃的备选</h3>${esc(detail.alternatives)}</div>`:''}${detail.tradeoffs ? `<div class="reason-section"><h3>收益与代价</h3>${esc(detail.tradeoffs)}</div>`:''}<div class="proposal-footer"><div class="version-note">原文版本 ${esc(detail.baseHash?.slice(0,10) ?? '不存在')} · 提案版本 ${esc(detail.contentHash.slice(0,10))}</div><div class="actions">${actions}</div></div></section></div>`;
  }
  return `<div class="page"><div class="page-title"><div><h1>提案审核</h1><p>先看准确差异，再决定是否写入。</p></div>${button(icon('plus')+' 新建提案','new-proposal','','primary')}</div><div class="filter-bar">${filters}</div>${content}</div>`;
}

async function journal(sequence) {
  const entriesResult = await api(`/api/projects/${S.projectId}/journal`); if (sequence !== renderSequence) return ''; S.entries = entriesResult;
  let items = S.logMode === 'decision' ? S.catalog.docs.filter(d => d.role === 'decision') : S.entries;
  const months = [...new Set(items.map(item => item.date?.slice(0,7)).filter(Boolean))].sort().reverse();
  items = items.filter(item => (!S.month || item.date?.startsWith(S.month)) && (S.logMode !== 'decision' || S.noteStatus === 'all' || item.status === S.noteStatus));
  const entries = items.map(item => {
    const index = S.entries.indexOf(item);
    return `<article class="timeline-entry"><div class="row wrap"><time>${esc(item.date || '日期未标注')}</time>${S.logMode === 'decision' ? badge(item.status) : '<span class="pill">维护记录</span>'}${item.category ? `<span class="pill">${esc(categoryNames[item.category] ?? item.category)}</span>`:''}</div><h3>${esc(item.title.replace(/^\d{4}-\d{2}-\d{2}\s*[·—-]?\s*/,''))}</h3>${item.content ? `<p class="summary">${esc(plain(item.content).slice(0,220))}</p>` : `<p class="mono small muted">${esc(item.file)}</p>`}${S.logMode === 'decision' ? button('查看决定 '+icon('arrow-up-right'),'document',`${attr('file',item.file)} ${attr('project',S.projectId)}`,'text') : button('查看记录 '+icon('arrow-up-right'),'entry-detail',attr('index',index),'text')}</article>`;
  }).join('');
  return `<div class="page"><div class="page-title"><div><h1>维护路径</h1><p>记录改了什么，以及当时为什么这样改。</p></div>${button(icon('plus')+' 添加维护记录','add-journal','','primary')}</div><div class="subtabs">${[['journal','维护日志'],['decision','工程决策']].map(([mode,label]) => `<button class="segment ${S.logMode === mode ? 'active':''}" data-action="log-mode" data-mode="${mode}">${label}</button>`).join('')}</div><div class="filter-bar"><span class="label">月份</span><select id="month-filter" aria-label="按月份筛选"><option value="">全部月份</option>${months.map(month => `<option ${S.month === month ? 'selected':''}>${month}</option>`).join('')}</select>${S.logMode === 'decision' ? [['all','全部'],['implemented','已落地'],['proposed','方案稿'],['rejected','已否决'],['archived','已归档']].map(([status,label]) => `<button class="segment ${S.noteStatus === status ? 'active':''}" data-action="note-status" data-status="${status}">${label}</button>`).join('') : '<span class="muted small">背景 · 结果 · 验证 · 后续</span>'}${button('重置筛选','reset-logs','','text reset small')}</div>${entries ? `<div class="timeline">${entries}</div>` : empty('没有匹配的记录',S.logMode === 'decision' ? '工程笔记从项目的 .agents/notes 中读取，方案稿、已落地与已否决内容分别展示。' : '重要修改完成后，再记录值得交接的背景与验证。',button('重置筛选','reset-logs')+(S.logMode === 'journal' ? button('添加维护记录','add-journal','','primary'):''))}</div>`;
}

function quote(value) { return `'${String(value).replace(/'/g,"'\\''")}'`; }
function connection() {
  const id = S.projectId || '<项目ID>';
  const command = `node ${quote(S.session.root+'/src/cli.mjs')} context --project ${quote(id)} --data ${quote(S.session.dataDir)}`;
  const skillPath = S.session.root + '/skills/agent-workbench/SKILL.md';
  return `<div class="page"><div class="page-title"><div><h1>让 Code Agent 读取项目上下文</h1><p>同一份项目文件，按需读取，不依赖特定聊天工具。</p></div></div><div class="form-page"><div class="label">Skill 文件</div><div class="code-copy"><code>${esc(skillPath)}</code>${button(icon('copy')+' 复制路径','copy',attr('text',skillPath),'small')}</div><div class="connect-list"><div class="connect-row">${icon('file-text')}<div><h3>读取有效约束</h3><p>先读全局与项目入口，模块正文按需读取。</p></div></div><div class="connect-row">${icon('magnifying-glass')}<div><h3>查询维护背景</h3><p>查找修改来由、被否决的备选与关联文档。</p></div></div><div class="connect-row">${icon('pencil-simple')}<div><h3>提交待审提案</h3><p>保留来源和修改理由，候选进入审核队列。</p></div></div></div><h3 class="source-footer">读取命令</h3><div class="code-copy"><code>${esc(command)}</code>${button(icon('copy')+' 复制命令','copy',attr('text',command),'small')}</div><p class="notice">Skill 不提供批准入口。代码 Agent 生成候选，你在看板审核具体差异后生效。</p><p class="muted small">仓库内 Skill 可直接使用；若复制安装到其他位置，设置 AGENT_WORKBENCH_ROOT 指向工作台目录。不会自动修改你现有的 Agent 配置。</p></div></div>`;
}

function closeDialog() { $('#dialog').close(); lastFocus?.focus?.(); }
function showDialog(title, body, { subtitle = '', wide = false, drawer = false, submit } = {}) {
  const dialog = $('#dialog'); lastFocus = document.activeElement;
  if (dialog.open) dialog.close();
  dialog.onkeydown = null;
  dialog.className = drawer ? 'drawer' : wide ? 'wide-dialog' : '';
  dialog.innerHTML = `<div class="dialog-content"><div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>`:''}</div>${button(icon('x'),'close','aria-label="关闭"','icon ghost')}</div>${submit ? `<form id="dialog-form">${body}<div class="form-error notice error" role="alert"></div></form>` : body}</div>`;
  if (submit) dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const submitButton = form.querySelector('[type="submit"]');
    const errorNode = form.querySelector('.form-error'); errorNode.textContent = ''; if (submitButton) submitButton.disabled = true;
    try { await submit(Object.fromEntries(new FormData(form)),form); }
    catch(error) { errorNode.textContent = error.message; if (submitButton) submitButton.disabled = false; }
  };
  dialog.showModal();
}
const field = (label, name, value = '', { textarea = false, required = false, placeholder = '', help = '', rows = 3, readonly = false, cls = '' } = {}) => `<label class="field"><span>${esc(label)}${required ? ' *':''}</span>${textarea ? `<textarea name="${name}" rows="${rows}" class="${cls}" ${required ? 'required':''}>${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" ${required ? 'required':''} ${readonly ? 'readonly':''} placeholder="${esc(placeholder)}">`}${help ? `<p class="help">${esc(help)}</p>`:''}</label>`;
const formActions = (primary, extra = '') => `<div class="modal-actions">${extra}${button('取消','close')}<button class="btn primary" type="submit">${primary}</button></div>`;

function registerProject() {
  const demoPath = S.session.demo ? `${S.session.dataDir}/demo-projects/new-project` : '';
  const body = field('项目名称','name','',{placeholder:'例如：my-project'})+field('本地目录','root',demoPath,{required:true,placeholder:'/Users/you/Projects/my-project',help:'填写已存在目录的绝对路径。登记本身不修改项目文件。'})+`<div class="row">${button('检查目录','inspect-project','','small')}<span class="muted small" id="inspect-message">校验通过后可查看映射预览</span></div><details class="field"><summary class="muted small">自定义文档来源（可选）</summary>${field('约束入口（逗号分隔）','ruleFiles','AGENTS.md')}${field('模块目录（逗号分隔）','ruleRoots','docs/agent, .trellis/spec')}${field('维护目录','journalDir','docs/maintenance')}</details><p class="notice">只保存目录与来源映射，不自动创建约束文件。</p>`+formActions('登记项目');
  showDialog('登记项目',body,{subtitle:'把一个已有项目加入工作台。',submit:async values => {
    const project = await api('/api/projects',{...values,ruleFiles:splitPaths(values.ruleFiles),ruleRoots:splitPaths(values.ruleRoots)});
    closeDialog(); toast('项目已登记，未修改项目文件'); S.message = null; route('rules',{projectId:project.id,scope:'project',file:'',proposal:''});
  }});
}
const splitPaths = value => value.split(',').map(item => item.trim()).filter(Boolean);
async function inspectProject() {
  const form = $('#dialog-form'); if (!form) return;
  const label = $('#inspect-message'); label.textContent = '正在检查…';
  try { const result = await api('/api/projects/inspect',{root:form.elements.root.value}); label.textContent = '可读取 · '+(result.discovered.join(' · ') || '尚未发现约束或维护文档'); form.elements.root.classList.remove('field-error'); }
  catch(error) { label.textContent = error.message; form.elements.root.classList.add('field-error'); }
}
function globalSettings() {
  const current = S.data.global ? `${S.data.global.root}/${S.data.global.file}` : '';
  showDialog('全局偏好来源',field('已有 Markdown 文件的绝对路径','file',current,{placeholder:'/Users/you/personal-rules/AGENTS.md',help:'只登记已有文件，不改写文件，也不自动修改 Agent 的配置。留空可解除映射。'})+`<p class="notice">全局偏好与项目约束分开保存。实际读取入口由你的 Agent 配置决定。</p>`+formActions('保存映射'),{submit:async values => {
    await api('/api/global',{file:values.file.trim()}); closeDialog(); toast('全局来源已更新');
    if (!values.file.trim() && S.projectId === 'global') route('overview',{projectId:S.lastProject || '',scope:'project',file:''}); else await load();
  }});
}
async function settings() {
  if (!S.projectId) { registerProject(); return; }
  if (S.projectId === 'global') { globalSettings(); return; }
  const project = (await api(`/api/projects/${S.projectId}`)).project;
  showDialog('文档来源',field('项目名称','name',project.name,{required:true})+field('约束入口（逗号分隔）','ruleFiles',project.ruleFiles.join(', '),{required:true})+field('模块目录（逗号分隔）','ruleRoots',project.ruleRoots.join(', '),{help:'大型项目可选；只从登记目录中识别活动约束。'})+field('维护目录','journalDir',project.journalDir,{required:true})+`<p class="notice">修改映射不会改写这些文档。全局偏好可从侧栏单独配置。</p><div class="row between"><span class="muted small">${esc(project.root)}</span>${button('解除项目登记','remove-project',attr('id',project.id),'text small')}</div>`+formActions('保存映射'),{submit:async values => {
    await api(`/api/projects/${project.id}`,{...values,ruleFiles:splitPaths(values.ruleFiles),ruleRoots:splitPaths(values.ruleRoots)},'PATCH');
    closeDialog(); toast('来源映射已保存'); S.file = ''; await load();
  }});
}
async function removeProject(id) {
  showDialog('解除项目登记',`<p class="muted">只从工作台移除这个项目，不删除项目目录和文件。存在待审或冲突提案时，需要先处理。</p>`+formActions('解除登记'),{submit:async () => {
    await api(`/api/projects/${id}`,{},'DELETE'); closeDialog(); toast('已解除登记，项目文件保留'); route('overview',{projectId:'',file:'',proposal:''});
  }});
}

async function proposalEditor(id = '') {
  if (!S.projectId) { registerProject(); return; }
  const existing = id ? await api(`/api/proposals/${id}`) : null;
  const projectId = existing?.projectId ?? (S.view === 'rules' ? sourceId() : S.projectId);
  const catalog = projectId === S.projectId && S.catalog ? S.catalog : await api(`/api/projects/${projectId}`);
  const file = existing?.file ?? (S.view === 'rules' ? S.file : catalog.project.ruleFiles[0]);
  const original = existing ? null : await api(`/api/projects/${projectId}/document?file=${encodeURIComponent(file)}`);
  const body = `<p>${scopeBadge(projectId === 'global' ? 'global' : catalog.project.ruleFiles.includes(file) ? 'project':'module')} ${badge('pending')}</p>`+field('修改标题','title',existing?.title ?? '',{required:true,readonly:!!existing,placeholder:'一句话说明要改变什么'})+field('目标文件','file',file,{required:true,readonly:!!existing,help:'修改目标路径时，请同时核对完整建议内容。'})+field('来源','source',existing?.source ?? '',{required:true,readonly:!!existing,placeholder:'用户原话摘要、问题或可复核引用'})+field('修改理由','reason',existing?.reason ?? '',{textarea:true,required:true,rows:2})+field('建议的完整内容','content',existing?.content ?? original.content,{textarea:true,rows:12,cls:'editor'})+`<p class="notice">保存仅更新待审候选，不改原文件。编辑后需重新核对最终差异。</p>`+formActions(existing ? '保存并查看差异':'保存待审提案');
  showDialog(existing ? '编辑待审提案':'新建提案',body,{wide:true,submit:async values => {
    const result = existing ? await api(`/api/proposals/${id}/revise`,{content:values.content,reason:values.reason,contentHash:existing.contentHash}) : await api('/api/proposals',{...values,projectId});
    closeDialog(); toast('已保存待审提案，尚未写入约束'); S.proposalFilter = 'pending'; route('proposals',{projectId,scope:projectId === 'global' ? 'global':'project',proposal:result.id});
  }});
}
async function approve(id) {
  const detail = await api(`/api/proposals/${id}`);
  showDialog('批准并写入约束',`<p class="muted">仅应用你刚查看的这份差异。</p><dl class="meta"><dt>文件</dt><dd class="mono">${esc(detail.file)}</dd><dt>范围</dt><dd>${scopeBadge(detail.scope)}</dd><dt>版本</dt><dd>第 ${detail.revision} 版 · ${esc(detail.contentHash.slice(0,10))}</dd></dl><div class="mini-diff">${detail.changes.filter(change => change.added || change.removed).map(change => `<div class="${change.added ? 'diff-add':'diff-remove'}">${esc(change.value)}</div>`).join('')}</div><p class="notice">写入前再次核对原文；有变化则停止，不覆盖当前内容。完成后留下一条维护记录。</p>`+formActions('批准并写入'),{submit:async () => {
    try {
      await api(`/api/proposals/${id}/apply`,{baseHash:detail.baseHash,contentHash:detail.contentHash}); closeDialog();
      toast('约束已写入，维护记录已保存'); S.message = {type:'success',text:`已写入 ${detail.file}。这次修改的维护记录已保存。`};
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
    await api(`/api/proposals/${id}/reject`,values); closeDialog(); toast('已拒绝提案，未修改约束'); S.proposalFilter = 'rejected'; await load();
  }});
}
async function rebase(id) {
  showDialog('基于当前原文重新生成',`<p class="muted">保留原提案记录，用当前文件作为新基线。生成后仍需查看差异并审核；不会自动合并或批准。</p>`+formActions('生成新的待审提案'),{submit:async () => {
    const result = await api(`/api/proposals/${id}/rebase`,{}); closeDialog(); S.message = null;
    toast(result.noChanges ? '当前文件已包含全部建议，无剩余差异':'新提案已生成，请重新审核');
    S.proposalFilter = result.noChanges ? 'all':'pending'; route('proposals',{proposal:result.id});
  }});
}

function addJournal() {
  const body = field('标题','title','',{required:true})+field('背景','background','',{textarea:true,required:true,rows:2})+field('实际结果','result','',{textarea:true,required:true,rows:2})+field('验证或缺失验证','verification','',{textarea:true,rows:2,help:'写清实际执行的检查；计划或未经验证的判断不要写成已完成。'})+field('后续事项','next','',{textarea:true,rows:2})+field('关联文件','topic','',{placeholder:'例如：AGENTS.md'})+`<details><summary class="muted small">补充备选方案与代价（可选）</summary>${field('放弃的备选','alternatives','',{textarea:true,rows:2})}${field('收益与代价','tradeoffs','',{textarea:true,rows:2})}</details><p class="notice">维护记录描述事实，不会新增或批准约束。</p>`+formActions('保存维护记录');
  showDialog('添加维护记录',body,{wide:true,submit:async values => {
    const result = await api(`/api/projects/${S.projectId}/journal`,values); closeDialog(); toast(`已记录到 ${result.file}`); S.logMode = 'journal'; S.month = ''; route('journal');
  }});
}
async function documentDetail(projectId,file) {
  const catalog = await api(`/api/projects/${projectId}`); const doc = catalog.docs.find(item => item.file === file);
  const result = await api(`/api/projects/${projectId}/document?file=${encodeURIComponent(file)}`);
  const backlinks = catalog.docs.filter(item => item.file !== file && (item.title === file || item.file === result.supersededBy));
  showDialog(doc?.role === 'decision' ? '工程决策详情':'文档详情',`${doc ? `<div class="row wrap">${badge(doc.status)}${doc.category ? `<span class="pill">${esc(categoryNames[doc.category] ?? doc.category)}</span>`:''}</div>`:''}<div class="code-copy"><code>${esc(file)}</code>${button('复制路径','copy',attr('text',file),'small')}</div>${markdown(result.content,file,projectId,doc?.role === 'decision')}${backlinks.length ? '<h3>关联文档</h3>'+backlinks.map(item => button(esc(item.title),'document',`${attr('file',item.file)} ${attr('project',projectId)}`,'text doc-link')).join(''):''}`,{drawer:true});
}
function entryDetail(entry,projectId = S.projectId) {
  showDialog('维护记录详情',`<div class="code-copy"><code>${esc(entry.file)}</code>${button('复制路径','copy',attr('text',entry.file),'small')}</div>${markdown(entry.content,entry.file,projectId)}`,{drawer:true});
}
async function searchDialog() {
  if (!S.projectId) return;
  showDialog('搜索当前项目',`<label class="field"><span class="label">搜索词</span><input id="search-query" placeholder="输入关键词，如：保留修改" autocomplete="off"></label><div class="segments" id="search-kinds">${[['all','全部'],['document','文档'],['proposal','提案'],['journal','维护']].map(([kind,label]) => `<button class="segment ${S.searchKind === kind ? 'active':''}" type="button" data-action="search-kind" data-kind="${kind}">${label}</button>`).join('')}</div><div id="search-results" aria-live="polite"><p class="muted small">搜索已登记的当前项目，不读取其他项目或历史会话。</p></div><div class="status-caption">Enter 打开首项 · Esc 关闭</div>`,{wide:true});
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

async function action(target) {
  const { action: name } = target.dataset;
  if (name === 'close') return closeDialog();
  if (name === 'refresh') { S.message = null; return load(); }
  if (name === 'register') return registerProject();
  if (name === 'inspect-project') return inspectProject();
  if (name === 'project') { S.message = null; return route('rules',{projectId:target.dataset.id,scope:'project',file:'',proposal:''}); }
  if (name === 'tab') { S.message = null; return route(target.dataset.view); }
  if (name === 'connect') return route('connect');
  if (name === 'global') { if (!S.data.global) return globalSettings(); return route('rules',{projectId:'global',scope:'global',file:''}); }
  if (name === 'scope') {
    const scope = target.dataset.scope;
    if (scope === 'global' && !S.data.global) return globalSettings();
    if (S.projectId === 'global' && scope !== 'global') { if (!S.lastProject) return registerProject(); return route('rules',{projectId:S.lastProject,scope,file:''}); }
    return route('rules',{scope,file:''});
  }
  if (name === 'file') return route('rules',{file:target.dataset.file});
  if (name === 'read-mode') { S.raw = target.dataset.mode === 'raw'; return load(); }
  if (name === 'settings') return settings();
  if (name === 'remove-project') return removeProject(target.dataset.id);
  if (name === 'new-proposal') return proposalEditor();
  if (name === 'edit-proposal') return proposalEditor(target.dataset.id);
  if (name === 'open-proposal') { const p = S.data.proposals.find(item => item.id === target.dataset.id); S.proposalFilter = p && ['pending','conflict'].includes(p.status) ? 'pending':'all'; S.message = null; return route('proposals',{projectId:p?.projectId ?? S.projectId,proposal:target.dataset.id}); }
  if (name === 'proposal-filter') { S.proposalFilter = target.dataset.filter; return load(); }
  if (name === 'approve-proposal') return approve(target.dataset.id);
  if (name === 'retry-apply') { const p = await api(`/api/proposals/${target.dataset.id}`); await api(`/api/proposals/${p.id}/apply`,{baseHash:p.baseHash,contentHash:p.contentHash}); toast('应用记录已完成'); return load(); }
  if (name === 'reject-proposal') return reject(target.dataset.id);
  if (name === 'rebase-proposal') return rebase(target.dataset.id);
  if (name === 'add-journal') return addJournal();
  if (name === 'log-mode') { S.logMode = target.dataset.mode; S.month = ''; return load(); }
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

document.addEventListener('click',async event => {
  const target = event.target.closest('[data-action]');
  if (target) { event.preventDefault(); if (target.disabled) return; try { await action(target); } catch(error) { toast(error.message,true); } return; }
  const link = event.target.closest('.markdown a');
  if (!link) return;
  const href = link.getAttribute('href') ?? ''; if (/^https?:\/\//.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; return; }
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return;
  event.preventDefault();
  const container = link.closest('.markdown');
  const file = decodeURIComponent(new URL(href,`http://workbench/${container.dataset.file}`).pathname.slice(1));
  try { await documentDetail(container.dataset.project || S.projectId,file); } catch(error) { toast(error.message,true); }
});
document.addEventListener('change',event => {
  if (event.target.id === 'month-filter') { S.month = event.target.value; load(); }
  if (event.target.matches('.mobile-project') && event.target.value) {
    const value = event.target.value;
    if (value === '__register') registerProject(); else if (value === '__global') action({dataset:{action:'global'}}); else if (value === '__connect') route('connect'); else route('rules',{projectId:value,scope:'project',file:''});
  }
});
document.addEventListener('keydown',event => {
  if (event.key === '/' && !$('#dialog').open && !event.target.matches('input,textarea,select')) { event.preventDefault(); searchDialog(); }
});
$('#dialog').addEventListener('cancel',() => setTimeout(() => lastFocus?.focus?.(),0));
window.addEventListener('hashchange',load);
window.addEventListener('focus',() => { if (S.session && !$('#dialog').open) load(); });
try { S.session = await api('/api/session'); await load(); }
catch(error) { $('#app').innerHTML = `<div class="page"><h1>无法连接工作台</h1><p>${esc(error.message)}</p><p>启动本机服务后刷新页面。</p></div>`; }
