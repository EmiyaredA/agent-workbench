import path from 'node:path';
import { marked } from 'marked';

export const categories = ['architecture','feature','bug-fix','simplification','process','testing'];
const aliases = {
  problem:['problem','问题','背景'], decision:['decision','proposal','决策','提案','采用的方案'],
  alternatives:['alternatives considered','曾考虑的替代方案','曾考虑的备选','放弃的备选','考虑过的备选'],
  consequences:['consequences','后果','收益与代价'], verification:['verification','testing','验证'], next:['next','后续','后续事项'],
};
export function sections(content) {
  const result = {}; let active = '';
  for (const token of marked.lexer(content)) {
    if (token.type === 'heading' && token.depth <= 2) {
      active = token.depth === 2 ? token.text.trim().toLowerCase() : '';
      if (active) result[active] = '';
    } else if (active) result[active] += token.raw;
  }
  return Object.fromEntries(Object.entries(aliases).map(([key,names]) => [key,names.map(name => result[name]).find(Boolean)?.trim() ?? '']));
}
export function excerpt(content, limit = 180) {
  return String(content ?? '').replace(/<!--[^]*?-->/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim().slice(0,limit);
}
export function alternativeItems(content) {
  const items = []; let heading = ''; let reason = '';
  const add = (raw, explicitTitle = '') => {
    const text = excerpt(raw,1600); if (!text && !explicitTitle) return;
    const colon = text.search(/[：:]/);
    const split = !explicitTitle && colon > 0 && colon < 80 && !/^[a-z][a-z\d+.-]*:\/\//i.test(text);
    items.push({title:explicitTitle || (split ? text.slice(0,colon).trim() : excerpt(text,80)),
      reason:split ? text.slice(colon+1).trim() : text});
  };
  const flush = () => { if (heading) add(reason,heading); heading=''; reason=''; };
  for (const token of marked.lexer(content)) {
    if (token.type === 'heading' && token.depth >= 3) { flush(); heading=excerpt(token.text,160); }
    else if (heading) { if (token.type !== 'code' && token.type !== 'html') reason += token.raw; }
    else if (token.type === 'list') for (const item of token.items) {
      const text=item.tokens.filter(token=>!['code','html'].includes(token.type)).map(token=>token.raw).join(''); add(text);
    }
    else if (token.type === 'paragraph') add(token.raw);
  }
  flush();
  return items;
}

export function markdownLinks(content, file) {
  const links = new Set();
  marked.walkTokens(marked.lexer(content), token => {
    if (token.type !== 'link') return;
    const href = token.href;
    if (!href || /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(href)) return;
    let relative;
    try { relative = decodeURIComponent(href.split(/[?#]/)[0]); } catch { return; }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file),relative));
    if (!target.startsWith('../') && !target.includes('\\') && /\.mdx?$/i.test(target)) links.add(target);
  });
  return [...links];
}
export function journalMetadata(content) {
  const text = content.match(/<!-- awb-record:(\{[^]*?\}) -->/)?.[1];
  try { const meta = JSON.parse(text ?? '{}'); return meta.version === 1 ? meta : {}; } catch { return {}; }
}
export function journalBlocks(doc, text) {
  const blocks = []; let block = '';
  for (const token of marked.lexer(text)) {
    if (token.type === 'heading' && token.depth === 2) { if (block) blocks.push(block); block = token.raw; }
    else if (block) block += token.raw;
  }
  if (block) blocks.push(block);
  return (blocks.length ? blocks : [text]).map((content,index) => {
    const marker = content.match(/<!-- awb:([\w-]+) -->/)?.[1];
    return {...doc,key:doc.file+':'+(marker ?? index),title:content.match(/^##\s+(.+)/)?.[1] ?? doc.title,
      date:content.match(/^##\s+(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? (blocks.length ? '' : doc.date ?? ''),content};
  });
}
export function maintenance(store,id) {
  const catalog = store.catalog(id); const {project,docs} = catalog; const warnings = [...catalog.warnings];
  const known = new Map(docs.map(doc => [doc.file,doc]));
  // Reuse the already bounded catalog; do not re-scan the project for every note.
  const content = new Map(); let bytes = 0;
  for (const doc of docs) {
    try {
      const body = store.text(store.safe(project,doc.file)) ?? ''; bytes += Buffer.byteLength(body);
      if (bytes > 16_000_000) { warnings.push({message:'维护视图读取达到16 MB上限，结果可能不完整；请缩小登记来源。'}); break; }
      content.set(doc.file,body);
    }
    catch(error) { warnings.push({message:`${doc.file}: ${error.message}`}); }
  }
  const notes = docs.filter(doc => doc.role === 'decision' && content.has(doc.file)).map(doc => {
    const body = content.get(doc.file); const parts = sections(body);
    // Note headers follow the H1 in write-notes; core lineage only accepts its own preamble.
    const preamble = body.slice(0,8192).split(/\r?\n/).slice(0,40); const marks = []; let fence = false;
    for (const line of preamble) {
      if (/^\s{0,3}(```|~~~)/.test(line)) { fence=!fence; continue; }
      if (fence) continue;
      if (/^##\s/.test(line)) break;
      marks.push(line);
    }
    const header = marks.join('\n').replace(/<!--[^]*?-->/g,'');
    const replacement = header.match(/^superseded_by:\s*(.+)$/mi)?.[1]?.trim().replace(/^(?:"(.*)"|'(.*)')$/,'$1$2');
    let superseded = doc.superseded || /^status:\s*superseded\s*$/mi.test(header); let supersededBy = doc.supersededBy;
    if (replacement) {
      try {
        store.safe(project,replacement);
        if (replacement === doc.file || known.get(replacement)?.role !== 'decision') throw Error();
        superseded=true; supersededBy=replacement;
      } catch { warnings.push({message:`${doc.file}: 替代文件未找到、自指或不在登记范围：${replacement}`}); }
    }
    const status = doc.status === 'archived' || /^Archived:\s*\d{4}-\d{2}-\d{2}\b/mi.test(header) ? 'archived' : doc.status;
    return {...doc,status,superseded,...(supersededBy ? {supersededBy,fault:undefined} : {}),sections:Object.fromEntries(Object.entries(parts).map(([key,value]) => [key,excerpt(value,360)])),
      alternatives:alternativeItems(parts.alternatives),rejectionReason:excerpt(header.match(/^Status:\s*rejected\s*[—–-]\s*(.+)$/mi)?.[1] ?? '',800),
      summary:excerpt(parts.decision || parts.problem),links:markdownLinks(body,doc.file),inbound:[],entryKeys:[]};
  });
  const journals = id === 'global' ? store.journal(id) : docs.filter(doc=>doc.role==='journal' && content.has(doc.file)).flatMap(doc=>journalBlocks(doc,content.get(doc.file)));
  const entries = journals.map(entry => {
    const meta = journalMetadata(entry.content); const fields = {};
    const labels = {background:'背景',result:'结果',verification:'验证',next:'后续',topic:'相关文件'};
    for (const token of marked.lexer(entry.content)) if (token.type === 'list') for (const item of token.items) {
      for (const [key,label] of Object.entries(labels)) {
        const prefix = `**${label}**`;
        if (item.text.startsWith(prefix)) fields[key] = item.text.slice(prefix.length).replace(/^[：:]\s*/,'').trim();
      }
    }
    const explicit = [...(Array.isArray(meta.decisionFiles) ? meta.decisionFiles : []),...(Array.isArray(meta.relatedFiles) ? meta.relatedFiles : [])].filter(file => typeof file === 'string');
    const links = [...new Set([...markdownLinks(entry.content,entry.file),...explicit,...(known.has(fields.topic) ? [fields.topic] : [])])];
    return {...entry,...fields,title:entry.title.replace(/^\d{4}-\d{2}-\d{2}\s*[·—-]?\s*/,''),category:categories.includes(meta.category) ? meta.category : '',links};
  });
  const byFile = new Map(notes.map(note => [note.file,note]));
  const sources = [...docs.filter(doc => doc.role !== 'journal' && content.has(doc.file)).map(doc => ({...doc,links:[...new Set([...markdownLinks(content.get(doc.file),doc.file),...(byFile.get(doc.file)?.supersededBy ? [byFile.get(doc.file).supersededBy] : [])])]})),...entries];
  for (const source of sources) for (const file of source.links) {
    const target = byFile.get(file);
    if (target && source.file !== file) {
      target.inbound.push({file:source.file,key:source.key ?? '',title:source.title,kind:source.role ?? 'journal'});
      if (source.key) target.entryKeys.push(source.key);
    }
  }
  const decorate = links => links.map(file => ({file,exists:known.has(file),title:known.get(file)?.title ?? file}));
  for (const item of [...notes,...entries]) {
    item.links = decorate(item.links);
    for (const link of item.links) if (!link.exists) warnings.push({message:`${item.file}: 关联文件未找到或不在登记范围：${link.file}`});
  }
  for (const note of notes) {
    if (note.supersededBy && !known.has(note.supersededBy)) warnings.push({message:`${note.file}: 替代文件未找到或不在登记范围`});
    note.inbound = [...new Map(note.inbound.map(source => [source.key || source.file,source])).values()];
  }
  return {notes,entries,warnings};
}
