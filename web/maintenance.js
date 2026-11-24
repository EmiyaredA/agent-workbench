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
  const category = item => `<span class="pill ${item.category ? 'category-'+esc(item.category) : 'unlabeled'}">${esc(categories[item.category] ?? '未标注')}</span>`;
  const match = item => (!S.month || item.date?.startsWith(S.month)) && (!S.maintenanceCategory || item.category === S.maintenanceCategory) && (!S.maintenanceQuery || JSON.stringify([item.title,item.summary,item.sections,item.alternatives,item.rejectionReason,item.content,item.file]).toLowerCase().includes(S.maintenanceQuery.toLowerCase()));
  const sorted = items => items.slice().sort((a,b) => (b.date ?? '').localeCompare(a.date ?? '') || a.file.localeCompare(b.file));
  const global = S.projectId === 'global';
  const view = global ? 'timeline' : S.maintenanceView;
  const status = note => note.superseded ? 'superseded' : note.status;
  // Four projections of the same filtered note collection. Journal entries only
  // appear in the separate history reader and explicit relations in note detail.
  const notes = sorted(data.notes.filter(match).filter(note => S.noteStatus === 'all' || status(note) === S.noteStatus));
  if (S.maintenanceSort === 'oldest') notes.reverse();
  if (S.maintenanceSort === 'references') notes.sort((a,b)=>b.inbound.length-a.inbound.length);
  const months = [...new Set((global ? data.entries : data.notes).map(item => item.date?.slice(0,7)).filter(Boolean))].sort().reverse();
  const pitfalls = notes.flatMap(note => {
    const rows = [];
    if (note.status === 'rejected') rows.push({note,kind:'rejected',title:note.title,reason:note.rejectionReason || note.sections.problem});
    for (const alternative of note.alternatives ?? (note.sections.alternatives ? [{title:note.sections.alternatives,reason:note.sections.alternatives}] : [])) rows.push({note,kind:'alternative',...alternative});
    return rows;
  });
  const summary = global ? `${data.entries.filter(match).length} 条迭代` : `${notes.length} 条决策${view === 'pitfalls' ? ` · ${pitfalls.length} 条取舍` : ''}`;
  const nav = global ? '' : `<nav class="maintenance-tabs" aria-label="维护记录视图">${Object.entries(viewNames).map(([key,label]) => button(label,'maintenance-view',attr('view',key),S.maintenanceView === key ? 'active' : '')).join('')}</nav>`;
  const toolbar = `<div class="maintenance-nav">${nav}<span class="toolbar-count"></span>${!global ? button('迭代日志','maintenance-open',`${attr('kind','history')} ${attr('key','all')}`,'text small') : ''}${button(icon('plus')+' 记录迭代','add-journal','','primary')}</div><div class="maintenance-filters">${dropdown('month-filter','按月份筛选',[{value:'',label:'全部月份'},...months.map(value => ({value,label:value}))],S.month)}${!global ? dropdown('maintenance-category','按类别筛选',[{value:'',label:'全部类别'},...Object.entries(categories).map(([value,label]) => ({value,label}))],S.maintenanceCategory)+dropdown('maintenance-status','按状态筛选',[{value:'all',label:'全部状态'},...['implemented','proposed','rejected','archived','superseded'].map(value => ({value,label:{implemented:'已落地',proposed:'方案稿',rejected:'已否决',archived:'已归档',superseded:'已替代'}[value]}))],S.noteStatus)+dropdown('maintenance-sort','排序',[{value:'newest',label:'最新优先'},{value:'oldest',label:'最早优先'},{value:'references',label:'引用最多'}],S.maintenanceSort) : ''}<span class="maintenance-summary" aria-live="polite">${esc(summary)}</span><form class="maintenance-search" id="maintenance-search"><label class="sr-only" for="maintenance-query">搜索维护记录</label><input id="maintenance-query" name="query" placeholder="${global ? '搜索迭代日志…' : '搜索决策…'}" value="${esc(S.maintenanceQuery)}" maxlength="200"><button class="btn icon" type="submit" aria-label="搜索维护记录">${icon('magnifying-glass')}</button></form>${button('重置','maintenance-reset','','text small')}</div>`;
  const card = note => {
    const slug=note.file.split('/').pop().replace(/\.mdx?$/i,'');
    return `<button class="decision-card ${S.maintenanceSelection === 'note:'+note.file ? 'selected':''}" data-action="maintenance-open" data-kind="note" data-key="${esc(note.file)}"><div class="row wrap pillar-meta">${category(note)}<span class="reference-weight">被引用 × ${note.inbound.length}</span>${badge(note.superseded ? 'superseded':note.status)}</div><h3>${esc(note.title)}</h3><p>${esc(note.summary || '打开查看原始决定。')}</p><div class="pillar-footer"><time>${esc(note.date || '日期未标注')}</time><span class="pillar-slug" title="${esc(note.file)}">#${esc(slug)}</span><span>${note.entryKeys.length} 次关联迭代</span></div></button>`;
  };
  let body = '';
  if (view === 'baseline') {
    const current = notes.filter(active); const topics = notes.filter(note=>active(note) || note.status==='proposed'); const key = current.slice().sort((a,b) => b.inbound.length-a.inbound.length || (b.date ?? '').localeCompare(a.date ?? '')).slice(0,6);
    body = `<section class="decision-panel baseline-pillars"><div class="section-heading"><h2>${icon('bank')} 系统承重墙</h2><span>按明确引用排序 · 查看仍适用的已落地决定</span></div><div class="decision-grid">${key.map(card).join('')}</div>`;
    if (!current.length) body += empty('暂无当前架构决定','已落地且未被替代、未归档的工程笔记将在这里展示。');
    body += '</section>';
    if (topics.length) body += `<section class="decision-panel baseline-matrix"><div class="section-heading"><h2>${icon('puzzle-piece')} 领域架构分类</h2><span>已落地与方案稿按主题定位</span></div><div class="category-matrix topic-columns-${Math.min(3,new Set(topics.map(n=>n.category)).size)}">${[...new Set(topics.map(n=>n.category))].map(name=>`<section><h3>${esc(categories[name] ?? name)}<span>${topics.filter(n=>n.category===name).length}</span></h3>${topics.filter(n=>n.category===name).map(n=>`<div class="chamber-entry">${open('note',n.file,esc(n.title),'text doc-link')}<span class="chamber-date">${esc(n.date)}</span></div>`).join('')}</section>`).join('')}</div></section>`;
  }
  if (view === 'timeline') {
    const timelineItems = global ? sorted(data.entries.filter(match).map(item=>({...item,kind:'entry'}))) : notes.map(item=>({...item,kind:'note'}));
    // Keep months contiguous even when notes are sorted by reference weight.
    const monthGroups = new Map();
    for (const item of timelineItems) { const month=item.date?.slice(0,7) || '日期未标注';if(!monthGroups.has(month))monthGroups.set(month,[]);monthGroups.get(month).push(item); }
    const dated=[...monthGroups].sort(([a],[b])=>S.maintenanceSort==='oldest' ? a.localeCompare(b) : b.localeCompare(a)).flatMap(([,items])=>items);let lastMonth='';
    body = `<section class="decision-panel evolution-panel"><div class="section-heading"><h2>${icon('timer')} ${global ? '全局维护记录' : '技术演进时间线'}</h2><span>${global ? '实际维护日志' : '同一批决策按笔记日期排列'}</span></div><div class="maintenance-timeline">`+dated.map(item => {
      const month = item.date?.slice(0,7) || '日期未标注'; const heading = month !== lastMonth ? `<h3 class="month-heading">${esc(month)} · ${monthGroups.get(month).length} 条</h3>` : ''; lastMonth=month;
      return heading+`<article class="iteration-row"><div class="iteration-heading"><div class="row wrap"><time>${esc(item.date || '日期未标注')}</time>${category(item)}${item.kind === 'entry' ? '<span class="pill">迭代记录</span>' : badge(status(item))}</div><h3>${open(item.kind,item.kind==='note' ? item.file:item.key,esc(item.title),'text iteration-title')}</h3></div><p>${esc(item.result || item.summary || '查看原始记录了解背景。')}</p><div class="iteration-footer">${item.verification ? `<span class="iteration-verification">验证：${esc(item.verification)}</span>`:''}<span class="card-meta">${item.kind === 'entry' ? `${item.links.filter(link=>noteMap.has(link.file)).length} 个关联决策` : `${item.entryKeys.length} 次关联迭代`}</span></div></article>`;
    }).join('')+'</div>';
    if (!dated.length) body += empty(global ? '没有匹配的迭代' : '没有匹配的决策','调整月份、类别、状态或关键词后重新查找。');
    body += '</section>';
  }
  if (view === 'pitfalls') {
    const dossier = item => {
      const note=item.note; const adopted=active(note); const proposed=note.status==='proposed';
      const state = item.kind==='rejected' || note.status==='rejected' ? 'rejected' : adopted ? 'adopted' : proposed ? 'proposed' : 'historical';
      const verdict = state==='rejected' ? '已否决方案' : state==='adopted' ? '采纳决策' : state==='proposed' ? '拟议方案' : '历史决定';
      const label = item.kind==='rejected' ? '否决方案' : adopted ? '放弃备选' : proposed ? '曾考虑备选' : '历史备选';
      const slug=note.file.split('/').pop().replace(/\.mdx?$/i,'');
      return `<button type="button" class="pitfall-card pitfall-dossier ${S.maintenanceSelection==='note:'+note.file ? 'selected':''}" data-action="maintenance-open" data-kind="note" data-key="${esc(note.file)}" aria-label="查看取舍：${esc(note.title)} · ${esc(item.title)}"><span class="pitfall-meta">${category(note)}<span class="pitfall-source" title="${esc(note.file)}">#${esc(slug)}</span></span><span class="pitfall-hazard">${icon('prohibit')}<span>${label}：${esc(item.title)}</span></span><span class="pitfall-reason">${icon('lightbulb')}<span><strong>权衡依据：</strong>${esc(item.reason || '原文未单独注明原因，打开查看完整上下文。')}</span></span><span class="pitfall-verdict ${state}">${icon(state==='adopted' ? 'check-square' : state==='proposed' ? 'clock' : state==='rejected' ? 'prohibit':'archive')}<span>${verdict}：${esc(note.title)}</span>${icon('arrow-up-right')}</span></button>`;
    };
    body = `<section class="decision-panel pitfalls-panel"><div class="section-heading"><h2>${icon('shield-warning')} 避坑与反思智库</h2><span>记录放弃的备选与否决理由，便于后续查阅</span></div><div class="pitfall-list">${pitfalls.map(dossier).join('')}</div>${!pitfalls.length ? empty('暂无匹配的取舍记录','试试备选名称、权衡理由或决策标题。') : ''}</section>`;
  }
  if (view === 'list') {
    const items = notes;
    body = `<section class="decision-panel directory-panel"><div class="section-heading"><h2>${icon('clipboard-text')} 全部工程决策</h2></div><div class="decision-table-scroll"><table class="table decision-table"><thead><tr><th>编号</th><th>类别</th><th>标题</th><th>状态</th><th>首次提出</th><th>引用</th></tr></thead><tbody>${items.map((note,index)=>`<tr><td class="decision-number">#${String(index+1).padStart(3,'0')}</td><td class="decision-category">${category(note)}</td><td>${open('note',note.file,esc(note.title),'text decision-title')}</td><td>${badge(note.superseded ? 'superseded':note.status)}</td><td class="mono">${esc(note.date || '未标注')}</td><td>${note.inbound.length}</td></tr>`).join('')}</tbody></table></div>`;
    if (!items.length) body += empty('没有匹配的决策','调整状态或关键词后重新查找。');
    body += '</section>';
  }
  let detail = '';
  const selectedNote = data.notes.find(n=>'note:'+n.file===S.maintenanceSelection);
  const selectedEntry = data.entries.find(e=>'entry:'+e.key===S.maintenanceSelection);
  const selectedDoc = S.catalog.docs.find(doc=>'document:'+doc.file===S.maintenanceSelection);
  const selected = selectedNote || selectedEntry || selectedDoc;
  if (selected) {
    const source = selectedEntry ? selectedEntry.content : S.maintenanceDocument?.content ?? '';
    const files = (selected.links ?? []).filter(link=>!noteMap.has(link.file)).map(link => link.exists ? button(icon('file-text')+' '+esc(link.title),'document',`${attr('file',link.file)} ${attr('project',S.projectId)}`,'lineage-chip') : `<p class="notice warning small">关联未找到：${esc(link.file)}</p>`).join('');
    const outgoing = selectedNote ? selectedNote.links.filter(link=>noteMap.has(link.file)).map(link=>open('note',link.file,icon('arrow-up-left')+' '+esc(link.title),'lineage-chip')).join('') : '';
    const incoming = selectedNote ? selectedNote.inbound.filter(item=>noteMap.has(item.file)).map(item=>open('note',item.file,icon('arrow-down-right')+' '+esc(item.title),'lineage-chip')).join('') : selectedDoc ? data.notes.filter(note=>note.links.some(link=>link.file===selected.file)).map(note=>open('note',note.file,icon('arrow-down-right')+' '+esc(note.title),'lineage-chip')).join('') : '';
    const iterations = selectedNote ? selectedNote.entryKeys.map(key=>entryMap.get(key)).filter(Boolean).sort((a,b)=>(b.date ?? '').localeCompare(a.date ?? '')).map(entry=>open('entry',entry.key,`${esc(entry.date)} · ${esc(entry.title)}`,'lineage-chip')).join('') : '';
    const decisions = selectedEntry ? selectedEntry.links.filter(link=>noteMap.has(link.file)).map(link=>open('note',link.file,esc(link.title),'lineage-chip')).join('') : '';
    const group = (label,html) => html ? `<div class="lineage-group"><h3>${label}</h3><div class="lineage-chips">${html}</div></div>` : '';
    const relations = group('前置引用',outgoing)+group('被以下决定引用',incoming)+group('关联迭代',iterations)+group('关联决策',decisions)+group('关联文档',files);
    const chapter = (number,title,glyph,content,sourceHeading='') => `<section class="decision-chapter" data-source-heading="${esc(sourceHeading)}"><h2>${icon(glyph)}<span>${String(number).padStart(2,'0')}. ${title}</span></h2>${content}</section>`;
    let body;
    if (S.maintenanceFormat==='raw') body=`<pre class="decision-raw">${esc(source)}</pre>`;
    else if (selectedNote) {
      const groups=[];let current;
      for (const token of u.lexer(source)) {
        if (token.type==='heading' && token.depth<=2) {
          current=token.depth===2 ? {title:token.text,content:''} : null;
          if (current) groups.push(current);
        } else if (current) current.content+=token.raw;
      }
      const consumed=new Set();
      const part = aliases => { const value=groups.find(group=>aliases.includes(group.title.trim().toLowerCase()));if(value)consumed.add(value);return value; };
      const parts=[
        ['背景与痛点','target',['problem','问题','背景']],
        [selectedNote.status==='proposed' ? '拟议方案' : selectedNote.status==='rejected' ? '被否决的方案' : selectedNote.status==='archived' || selectedNote.superseded ? '历史裁定记录' : '落地裁定事实','lightning',['decision','proposal','决策','提案','采用的方案']],
        [active(selectedNote) ? '审慎考虑并放弃的备选' : '曾考虑的备选','prohibit',['alternatives considered','曾考虑的替代方案','曾考虑的备选','放弃的备选','考虑过的备选']],
        ['收益与工程代价','scales',['consequences','risks','后果','收益与代价','风险','风险与取舍']],
      ];
      body=parts.map(([title,glyph,aliases],index)=>{const value=part(aliases);return chapter(index+1,title,glyph,value?.content.trim() ? markdown(value.content,selected.file,S.projectId) : '<p class="muted">原文未独立记录这一部分。</p>',value?.title ?? '');}).join('');
      body+=chapter(5,'因果与血缘依赖链路','link',relations || '<p class="muted">暂无明确的交叉引用。</p>');
      let number=6;
      for (const extra of groups.filter(group=>!consumed.has(group))) {
        const linkHeading=['关联','关联文档','相关决定','相关文档','links','references'].includes(extra.title.trim().toLowerCase());
        const onlyLinks=!extra.content.replace(/\[[^\]]*\]\([^)]*\)/g,'').replace(/[\s·|,*#-]/g,'');
        if (linkHeading && onlyLinks) continue;
        body+=chapter(number++,esc(extra.title),'note',markdown(extra.content,selected.file,S.projectId),extra.title);
      }
      if(!groups.length)body+=chapter(number,'原始记录','file-text',markdown(source,selected.file,S.projectId,true));
    } else {
      const entryText = selectedEntry ? u.lexer(source.replace(/^##[^\n]*\n/,'')) .map(token=> {
        if(token.type!=='list')return token.raw;
        return token.items.filter(item=> {
          if(!/^\*\*关联(?:决策|文档)\*\*[：:]/.test(item.text))return true;
          return !!item.text.replace(/^\*\*关联(?:决策|文档)\*\*[：:]\s*/,'').replace(/\[[^\]]*\]\([^)]*\)/g,'').replace(/[\s·,，;；]/g,'');
        }).map(item=>item.raw).join('\n')+'\n\n';
      }).join('') : source;
      body=markdown(entryText,selected.file,S.projectId);
      if(relations)body+=chapter(1,'相关记录','link',relations);
    }
    const slug=selected.file.split('/').pop().replace(/\.mdx?$/i,'');
    const heading=selectedNote || selectedEntry ? `<h1 id="maintenance-detail-title">${esc(selected.title)}</h1><div class="decision-timestamp"><time>${esc(selected.date || '日期未标注')}</time><span>·</span><span>${esc(slug)}</span>${selectedNote ? `<span>·</span><strong>被引用 ${selectedNote.inbound.length} 次</strong>`:''}</div>` : '';
    detail=`<div class="maintenance-backdrop" data-action="maintenance-dismiss" aria-hidden="true"></div><aside class="maintenance-detail" aria-label="维护详情" data-selection="${esc(S.maintenanceSelection)}" data-format="${esc(S.maintenanceFormat)}" tabindex="-1"><div class="decision-drawer-bar"><div class="row wrap">${selectedNote ? badge(selectedNote.superseded ? 'superseded':selectedNote.status)+category(selectedNote) : `<span class="pill">${selectedEntry ? '迭代记录':'文档阅读'}</span>`}</div>${button(icon('x'),'maintenance-close','aria-label="关闭维护详情"','icon ghost')}</div><div class="decision-drawer-body">${heading}${body}${selectedNote?.supersededBy ? `<div class="lineage-chips">${button('查看替代决定','document',`${attr('file',selectedNote.supersededBy)} ${attr('project',S.projectId)}`,'lineage-chip')}</div>`:''}<div class="decision-drawer-footer"><div class="actions">${button(S.maintenanceFormat==='raw' ? '返回阅读':'查看原文','maintenance-raw')}${button(icon('copy')+' 复制交接摘要','copy',attr('text',`${selected.title}\n来源：${selected.file}\n${selectedNote ? Object.entries(selected.sections).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('\n') : [selected.result,selected.verification,selected.next].filter(Boolean).join('\n')}`),'small')}</div><p class="path-line">${esc(selected.file)}</p></div></div></aside>`;
  } else if (S.maintenanceSelection==='history:all') {
    detail=`<div class="maintenance-backdrop" data-action="maintenance-dismiss" aria-hidden="true"></div><aside class="maintenance-detail" aria-label="维护详情" data-selection="history:all" data-format="read" tabindex="-1"><div class="decision-drawer-bar"><strong>迭代日志</strong>${button(icon('x'),'maintenance-close','aria-label="关闭维护详情"','icon ghost')}</div><div class="decision-drawer-body"><h1 id="maintenance-detail-title">项目迭代日志</h1><p class="muted small">记录实际改动、验证与后续；通过明确链接关联决策。</p><div class="maintenance-history">${sorted(data.entries).map(entry=>`<article class="iteration-row"><time>${esc(entry.date)}</time><h3>${open('entry',entry.key,esc(entry.title),'text iteration-title')}</h3><p>${esc(entry.result || entry.summary || '')}</p></article>`).join('') || empty('尚无迭代日志','记录重要改动后，可在这里回看。')}</div></div></aside>`;
  } else if (S.maintenanceSelection) detail=`<div class="maintenance-backdrop" data-action="maintenance-dismiss" aria-hidden="true"></div><aside class="maintenance-detail" aria-label="维护详情" tabindex="-1"><div class="decision-drawer-bar"><strong>记录不可用</strong>${button(icon('x'),'maintenance-close','aria-label="关闭维护详情"','icon ghost')}</div><div class="decision-drawer-body"><p>所选记录已移动或不再可读。</p></div></aside>`;
  return `<div class="page maintenance-page ${global ? '' : 'decision-board-view'} ${view==='pitfalls' ? 'pitfalls-view':''}"><h1 class="sr-only">维护路径</h1>${toolbar}${data.warnings.length ? `<details class="maintenance-warnings"><summary>${data.warnings.length} 条来源或关联提示</summary>${data.warnings.map(w=>`<p>${esc(w.message)}</p>`).join('')}</details>`:''}<div class="maintenance-layout ${detail ? 'has-detail':''}"><section class="maintenance-content">${body}</section>${detail}</div></div>`;
}
