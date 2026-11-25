import { marked } from 'marked';

export const noteShape = file => file.match(/^\.agents\/notes\/(proposed|implemented|rejected|archived)\/([^/]+)\/(\d{4}-\d{2}-\d{2})-([^/]+)\.md$/);
export const validNoteDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
const aliases = {
  problem:['problem','问题'], proposal:['proposal','提议','方案','提案'], decision:['decision','决定','决策'],
  alternatives:['alternatives considered','备选方案','替代方案','曾考虑的备选','曾考虑的替代方案'],
  acceptance:['acceptance criteria','验收标准','验收条件','接受标准'], risks:['risks','风险'],
  consequences:['consequences','后果','影响','结果','结果与代价','收益与代价','影响与验证'],
};
const heading = text => text.replace(/[（(].*$/,'').trim().toLowerCase();
export function noteFormatErrors(file,content,categories) {
  const match = noteShape(file); const errors = [];
  const add = text => errors.push(`${file}: ${text}`);
  if (!match || !categories.includes(match[2])) { add('路径须为 lifecycle/六类主题/YYYY-MM-DD-topic.md'); return errors; }
  try { if (!validNoteDate(match[3])) add('首次提出日期无效'); } catch { add('首次提出日期无效'); }
  const lifecycle = match[1];
  const lines = content.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? '') || lines[1] !== '') add('头部须为 Agent Note 标题、空行、Status');
  const expected = lifecycle === 'archived' ? 'implemented' : lifecycle;
  if (!(expected === 'rejected' ? /^Status: rejected — \S.*$/ : new RegExp(`^Status: ${expected}$`)).test(lines[2] ?? '')) add('Status 与目录不一致，否决必须说明原因');
  if (lifecycle === 'archived') {
    try { if (!validNoteDate(lines[3]?.replace(/^Archived: /,''))) add('Archived 日期无效'); } catch { add('Archived 日期无效'); }
    if (!/^Archived: /.test(lines[3] ?? '') || lines[4] !== '') add('Archived 必须紧邻 Status，随后空行');
    return errors; // Frozen bodies and their historical outbound links are not rewritten.
  }
  if (lines[3] !== '' || lines.some(line=>/^Archived:/.test(line))) add('活动笔记头部必须空行且不含 Archived');
  const tokens = marked.lexer(content);
  const headings = tokens.filter(token=>token.type === 'heading' && token.depth === 2).map(token=>heading(token.text));
  const required = ['problem','alternatives',...(lifecycle === 'proposed' ? ['proposal','acceptance','risks'] : lifecycle === 'implemented' ? ['decision','consequences'] : ['proposal'])];
  if (!aliases.problem.includes(headings[0])) add('首节必须为 Problem／问题');
  for (const name of required) if (!headings.some(h=>aliases[name].includes(h))) add(`缺少 ${name} 小节`);
  if (lifecycle === 'implemented' && headings.some(h=>[...aliases.proposal,...aliases.acceptance,'plan','migration plan','计划','规划','迁移计划'].includes(h))) add('已落地笔记仍含计划态标题');
  const statusLines = tokens.filter(token=>token.type==='paragraph').flatMap(token=>token.text.split('\n')).filter(line=>/^Status: (proposed|implemented|rejected\b)/.test(line));
  if (statusLines.length !== 1) add('Status 必须只出现一次');
  return errors;
}
