import path from 'node:path';
import { journalBlocks, journalFields, journalMetadata } from './maintenance.mjs';

const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const normalized=value=>String(value ?? '').replace(/\r\n?/g,'\n').trim();
const labels={category:'标签',background:'背景',result:'结果',alternatives:'放弃的备选',tradeoffs:'收益与代价',verification:'验证',next:'后续',topic:'相关文件'};

// Check the same observable structure the board reads before any file is changed.
export function renderJournalEntry(input,key,file,date) {
  if(typeof input.title!=='string' || !input.title.trim() || input.title.length>500 || /[\r\n]/.test(input.title)) invalid('维护标题须为不超过500字的单行文本');
  const title=normalized(input.title);
  const metadata=input._metadata ? `<!-- awb-record:${JSON.stringify(input._metadata).replace(/</g,'\\u003c')} -->\n\n` : '';
  const fields=Object.entries(labels).filter(([name])=>input[name]).map(([name,label])=>`- **${label}**：${String(input[name]).replace(/\r\n?/g,'\n').replace(/\n/g,'\n  ')}`).join('\n');
  const links=[['关联决策',input._metadata?.decisionFiles],['关联文档',input._metadata?.relatedFiles]].filter(([,files])=>files?.length).map(([label,files])=>`- **${label}**：`+files.map(target=>`[${path.posix.basename(target).replace(/[\[\]]/g,'')}](<${path.posix.relative(path.posix.dirname(file),target).split('/').map(part=>encodeURIComponent(part).replace(/[()]/g,char=>'%'+char.charCodeAt(0).toString(16))).join('/')}>)`).join(' · ')).join('\n');
  const text=`\n## ${date} · ${title}\n\n<!-- awb:${key} -->\n\n${metadata}${fields}\n${links ? links+'\n' : ''}`;
  const blocks=journalBlocks({file},text);
  if(blocks.length!==1 || blocks[0].key!==file+':'+key || blocks[0].title!==date+' · '+title || JSON.stringify(journalMetadata(blocks[0].content))!==JSON.stringify(input._metadata ?? {})) invalid('维护内容改变了记录标识或元数据，请移除保留的 awb 标记');
  const parsed=journalFields(blocks[0].content);
  for(const [name,label] of Object.entries(labels)) if(normalized(parsed[name])!==normalized(input[name])) invalid(`维护字段“${label}”无法完整解析，请检查 Markdown 结构`);
  return text;
}

export function validateJournalAppend(before,entry,file,key) {
  const expected=journalBlocks({file},entry)[0];
  const matches=journalBlocks({file},before+entry).filter(block=>block.key===file+':'+key);
  if(matches.length!==1 || matches[0].title!==expected.title || JSON.stringify(journalFields(matches[0].content))!==JSON.stringify(journalFields(expected.content)) || JSON.stringify(journalMetadata(matches[0].content))!==JSON.stringify(journalMetadata(expected.content))) invalid('维护日志追加后无法独立解析，请检查现有日志的未闭合代码块或记录标记；未写入');
}
