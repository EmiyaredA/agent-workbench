const viewNames = {baseline:'架构基线',timeline:'演进时间线',pitfalls:'避坑智库',list:'决策清单'};
const categories = {architecture:'架构设计',feature:'功能特性','bug-fix':'缺陷修复',simplification:'化简裁撤',process:'流程规范',testing:'测试基建'};
export function renderMaintenance(data,S,u) {
  const {esc,icon,button,dropdown,markdown,empty} = u;
  const badge = status => u.badge(status).replace('已拒绝','已否决');
  const attr = (name,value) => `data-${name}="${esc(value)}"`;
  const open = (kind,key,label,classes='text small') => button(label,'maintenance-open',`${attr('kind',kind)} ${attr('key',key)}`,classes);
  const active = note => note.status === 'implemented' && !note.superseded;
  const noteMap = new Map(data.notes.map(note => [note.file,note]));
  const entryMap = new Map(data.entries.map(entry => [entry.key,entry]));
  const category = item => item.category ? `<span class="pill category-${esc(item.category)}">${esc(categories[item.category] ?? item.category)}</span>` : '';
  const match = item => (!S.month || item.date?.startsWith(S.month)) && (!S.maintenanceCategory || item.category === S.maintenanceCategory) && (!S.maintenanceQuery || JSON.stringify([item.title,item.summary,item.sections,item.content,item.file]).toLowerCase().includes(S.maintenanceQuery.toLowerCase()));
  const sorted = items => items.slice().sort((a,b) => (b.date ?? '').localeCompare(a.date ?? '') || a.file.localeCompare(b.file));
  const notes = sorted(data.notes.filter(match));
  const global = S.projectId === 'global';
  const view = global ? 'timeline' : S.maintenanceView;
  const timelineItems = (global || S.maintenanceKind === 'iteration' ? data.entries.map(item => ({...item,kind:'entry'})) : data.notes.map(item => ({...item,kind:'note'}))).filter(match);
  const months = [...new Set((view === 'timeline' && (global || S.maintenanceKind === 'iteration') ? data.entries : data.notes).map(item => item.date?.slice(0,7)).filter(Boolean))].sort().reverse();
  const listMatches = notes.filter(note => S.noteStatus === 'all' || (S.noteStatus === 'superseded' ? note.superseded : note.status === S.noteStatus));
  const summary = view === 'baseline' ? `已落地 ${notes.filter(active).length} · 方案稿 ${notes.filter(n=>n.status==='proposed').length} · 已否决 ${notes.filter(n=>n.status==='rejected').length} · 已归档 ${notes.filter(n=>n.status==='archived').length}`
    : view === 'timeline' ? `${timelineItems.length} 条${!global && S.maintenanceKind === 'decision' ? '决策' : '迭代'}`
    : view === 'pitfalls' ? `${notes.filter(note=>note.status==='rejected' || note.sections.alternatives).length} 条来源` : `${listMatches.length} 条决策`;
  const nav = global ? '' : `<nav class="maintenance-tabs" aria-label="维护记录视图">${Object.entries(viewNames).map(([key,label]) => button(label,'maintenance-view',attr('view',key),S.maintenanceView === key ? 'active' : '')).join('')}</nav>`;
  const toolbar = `<div class="maintenance-nav">${nav}<span class="toolbar-count"></span>${button(icon('plus')+' 记录迭代','add-journal','','primary')}</div><div class="maintenance-filters">${dropdown('month-filter','按月份筛选',[{value:'',label:'全部月份'},...months.map(value => ({value,label:value}))],S.month)}${!global ? dropdown('maintenance-category','按类别筛选',[{value:'',label:'全部类别'},...Object.entries(categories).map(([value,label]) => ({value,label}))],S.maintenanceCategory) : ''}${view === 'timeline' && !global ? dropdown('maintenance-kind','时间线内容',[{value:'iteration',label:'实际迭代'},{value:'decision',label:'决策首次提出'}],S.maintenanceKind) : ''}${view === 'list' ? dropdown('maintenance-status','按状态筛选',[{value:'all',label:'全部状态'},...['implemented','proposed','rejected','archived','superseded'].map(value => ({value,label:{implemented:'已落地',proposed:'方案稿',rejected:'已否决',archived:'已归档',superseded:'已替代'}[value]}))],S.noteStatus)+dropdown('maintenance-sort','排序',[{value:'newest',label:'最新优先'},{value:'oldest',label:'最早优先'},{value:'references',label:'引用最多'}],S.maintenanceSort) : ''}<span class="maintenance-summary" aria-live="polite">${esc(summary)}</span><form class="maintenance-search" id="maintenance-search"><label class="sr-only" for="maintenance-query">搜索维护记录</label><input id="maintenance-query" name="query" placeholder="搜索当前视图…" value="${esc(S.maintenanceQuery)}" maxlength="200"><button class="btn icon" type="submit" aria-label="搜索维护记录">${icon('magnifying-glass')}</button></form>${button('重置','maintenance-reset','','text small')}</div>`;
  const card = note => `<button class="decision-card ${S.maintenanceSelection === 'note:'+note.file ? 'selected':''}" data-action="maintenance-open" data-kind="note" data-key="${esc(note.file)}"><div class="row wrap">${category(note)}${badge(note.superseded ? 'superseded':note.status)}</div><h3>${esc(note.title)}</h3><p>${esc(note.summary || '打开查看原始决定。')}</p><div class="card-meta">${note.inbound.length} 个引用 · ${note.entryKeys.length} 次关联迭代</div></button>`;
  let body = '';
  if (view === 'baseline') {
    const current = notes.filter(active); const key = current.slice().sort((a,b) => b.inbound.length-a.inbound.length || (b.date ?? '').localeCompare(a.date ?? '')).slice(0,6);
    body = `<div class="section-heading"><h2>关键决定</h2><span>按明确引用排序 · 工程决定不自动成为约束</span></div><div class="decision-grid">${key.map(card).join('')}</div>`;
    if (!current.length) body += empty('暂无当前架构决定','已落地且未被替代、未归档的工程笔记将在这里展示。');
    else body += `<div class="section-heading"><h2>按主题浏览</h2></div><div class="category-matrix">${[...new Set(current.map(n=>n.category))].map(name=>`<section><h3>${esc(categories[name] ?? name)}</h3>${current.filter(n=>n.category===name).map(n=>open('note',n.file,esc(n.title),'text doc-link')).join('')}</section>`).join('')}</div>`;
  }
  if (view === 'timeline') {
    const dated = sorted(timelineItems); let lastMonth = '';
    body = `<div class="section-heading"><h2>${global ? '全局维护记录' : S.maintenanceKind === 'decision' ? '决策首次提出' : '项目迭代'}</h2></div>${!global && S.maintenanceKind === 'decision' ? '<p class="muted small">日期来自笔记首次提出日，不表示方案的实际实施时间。</p>':''}<div class="maintenance-timeline">`+dated.map(item => {
      const month = item.date?.slice(0,7) || '日期未标注'; const heading = month !== lastMonth ? `<h3 class="month-heading">${esc(month)}</h3>` : ''; lastMonth=month;
      return heading+`<article class="iteration-row"><div class="iteration-heading"><div class="row wrap"><time>${esc(item.date || '日期未标注')}</time>${category(item)}<span class="pill">${item.kind === 'entry' ? '迭代记录':'首次提出'}</span>${item.kind === 'note' ? badge(item.status):''}</div><h3>${open(item.kind,item.kind==='note' ? item.file:item.key,esc(item.title),'text iteration-title')}</h3></div><p>${esc(item.result || item.summary || '查看原始记录了解背景。')}</p><div class="iteration-footer">${item.verification ? `<span class="iteration-verification">验证：${esc(item.verification)}</span>`:''}<span class="card-meta">${item.kind === 'entry' ? `${item.links.filter(link=>noteMap.has(link.file)).length} 个关联决策` : `${item.entryKeys.length} 次关联迭代`}</span></div></article>`;
    }).join('')+'</div>';
    if (!dated.length) body += empty('没有匹配的迭代','记录实际发生的改动、验证和后续，或重置筛选。');
  }
  if (view === 'pitfalls') {
    const items = notes.filter(note => note.status === 'rejected' || note.sections.alternatives);
    body = `<div class="section-heading"><h2>避坑与取舍</h2></div><div class="pitfall-list">${items.map(note=>`<article class="pitfall-card"><div class="row wrap">${category(note)}${badge(note.status)}<span class="muted small">${note.status === 'rejected' ? '否决方案':'备选与代价'}</span></div><h3>${open('note',note.file,esc(note.title),'text iteration-title')}</h3><p>${esc(note.status === 'rejected' ? note.sections.decision || note.sections.problem : note.sections.alternatives)}</p>${note.sections.consequences ? `<p class="muted">${esc(note.sections.consequences)}</p>`:''}</article>`).join('')}</div>`;
    if (!items.length) body += empty('暂无匹配的取舍记录','有明确否决或备选方案的工程笔记将在这里出现。');
  }
  if (view === 'list') {
    const items = listMatches.slice();
    if (S.maintenanceSort === 'oldest') items.reverse();
    if (S.maintenanceSort === 'references') items.sort((a,b)=>b.inbound.length-a.inbound.length);
    body = `<div class="section-heading"><h2>全部工程决策</h2></div><div class="decision-table-scroll"><table class="table decision-table"><thead><tr><th>类别</th><th>标题</th><th>状态</th><th>首次提出</th><th>引用</th></tr></thead><tbody>${items.map(note=>`<tr><td>${category(note)}</td><td>${open('note',note.file,esc(note.title),'text decision-title')}</td><td>${badge(note.superseded ? 'superseded':note.status)}</td><td class="mono">${esc(note.date || '未标注')}</td><td>${note.inbound.length}</td></tr>`).join('')}</tbody></table></div>`;
    if (!items.length) body += empty('没有匹配的决策','调整状态或关键词后重新查找。');
  }
  let detail = '';
  const selectedNote = data.notes.find(n=>'note:'+n.file===S.maintenanceSelection);
  const selectedEntry = data.entries.find(e=>'entry:'+e.key===S.maintenanceSelection);
  const selected = selectedNote || selectedEntry;
  if (selected) {
    const source = selectedNote ? S.maintenanceDocument?.content ?? '' : selectedEntry.content;
    const relations = selectedNote ? selectedNote.entryKeys.map(key=>entryMap.get(key)).filter(Boolean).map(entry=>open('entry',entry.key,`${esc(entry.date)} · ${esc(entry.title)}`,'text doc-link')).join('') : selectedEntry.links.filter(link=>noteMap.has(link.file)).map(link=>open('note',link.file,esc(link.title),'text doc-link')).join('');
    const files = selected.links.map(link => link.exists ? button(icon('file-text')+' '+esc(link.title),'document',`${attr('file',link.file)} ${attr('project',S.projectId)}`,'text doc-link') : `<p class="notice warning small">关联未找到：${esc(link.file)}</p>`).join('');
    detail = `<aside class="maintenance-detail" aria-label="维护详情" tabindex="-1"><div class="row between"><strong>${selectedNote ? '工程决策':'迭代记录'}</strong>${button(icon('x'),'maintenance-close','aria-label="关闭维护详情"','icon ghost')}</div>${selectedNote ? `<div class="row wrap detail-meta">${category(selectedNote)}${badge(selectedNote.superseded ? 'superseded':selectedNote.status)}</div>`:''}${markdown(source,selected.file,S.projectId,!!selectedNote)}${selectedNote?.supersededBy ? button('查看替代决定','document',`${attr('file',selectedNote.supersededBy)} ${attr('project',S.projectId)}`,'text doc-link'):''}<div class="detail-related"><h3>${selectedNote ? '关联迭代':'关联决策'}</h3>${relations || '<p class="muted small">暂无明确关联。</p>'}<h3>关联文档</h3>${files || '<p class="muted small">暂无明确关联。</p>'}</div><div class="actions">${button('查看原文','maintenance-raw',`${attr('file',selected.file)} ${attr('entry',selectedEntry?.key ?? '')}`)}${button(icon('copy')+' 复制交接摘要','copy',attr('text',`${selected.title}\n来源：${selected.file}\n${selectedNote ? Object.entries(selected.sections).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('\n') : [selected.result,selected.verification,selected.next].filter(Boolean).join('\n')}`),'small')}</div><p class="path-line">${esc(selected.file)}</p></aside>`;
  } else if (S.maintenanceSelection) detail = `<aside class="maintenance-detail"><p>所选记录已移动或不再可读。</p>${button('关闭','maintenance-close')}</aside>`;
  return `<div class="page maintenance-page"><h1 class="sr-only">维护路径</h1>${toolbar}${data.warnings.length ? `<details class="maintenance-warnings"><summary>${data.warnings.length} 条来源或关联提示</summary>${data.warnings.map(w=>`<p>${esc(w.message)}</p>`).join('')}</details>`:''}<div class="maintenance-layout ${detail ? 'has-detail':''}"><section class="maintenance-content">${body}</section>${detail}</div></div>`;
}
