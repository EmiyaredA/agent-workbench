import fs from 'node:fs';

const fail = message => { throw Error('XML 输入：' + message); };
const xmlCharacter = code => code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
function decode(text) {
  if (text.includes(']]>')) fail('正文中的 ]]> 请使用拆分的 CDATA');
  return text.replace(/&([^;\s<&]*);|&/g, (match, name) => {
    if (Object.hasOwn(entities, name)) return entities[name];
    if (/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(name ?? '')) {
      const code = name[1] === 'x' ? parseInt(name.slice(2),16) : Number(name.slice(1));
      if (xmlCharacter(code)) return String.fromCodePoint(code);
    }
    fail('无效实体；正文可使用 CDATA，普通文本中的 & 写为 &amp;');
  });
}

// Input dialect: one command root, scalar tags and file lists. No attributes,
// namespaces, DTD or external entity resolution; Markdown stays inside CDATA.
export function parseXmlInput(raw, command) {
  if (Buffer.byteLength(raw) > 2_000_000) fail('文件不能超过 2 MB');
  for (const character of raw) if (!xmlCharacter(character.codePointAt(0))) fail('包含无效 XML 字符');
  const text = raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?\s*\?>/i,'');
  const document = {name:'',children:[],text:''};
  const stack = [document];
  const tokens = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--([\s\S]*?)-->|<\/([A-Za-z][A-Za-z0-9]*)\s*>|<([A-Za-z][A-Za-z0-9]*)\s*(\/?)>|([^<]+)/gy;
  let position = 0;
  while (position < text.length) {
    tokens.lastIndex = position;
    const token = tokens.exec(text);
    if (!token) fail('标签无效或未闭合；仅支持无属性标签、注释与 CDATA');
    position = tokens.lastIndex;
    const current = stack.at(-1);
    if (token[1] !== undefined) {
      if (stack.length === 1) fail('CDATA 必须放在字段标签内');
      current.text += token[1];
    } else if (token[2] !== undefined) {
      if (token[2].includes('--') || token[2].endsWith('-')) fail('注释格式无效');
    } else if (token[3]) {
      if (stack.length === 1 || current.name !== token[3]) fail('开始和结束标签不匹配');
      stack.pop();
    } else if (token[4]) {
      if (stack.length > 3 || current.children.length >= 100) fail('标签嵌套或数量超出字段范围');
      const node = {name:token[4],children:[],text:''};
      current.children.push(node);
      if (!token[5]) stack.push(node);
    } else current.text += decode(token[6]);
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.text.trim()) fail('需要一个完整的命令根标签');
  const root = document.children[0];
  if (root.name !== command || root.text.trim()) fail(`根标签应为 <${command}>，字段放在其内部`);
  const common = ['projectId','title','category','operationId','alternatives','tradeoffs'];
  const fields = command === 'record'
    ? [...common,'background','result','verification','next','topic','decisionFiles','relatedFiles']
    : [...common,'file','reason','source','content',...(command === 'change' ? ['baseHash'] : [])];
  const result = {};
  for (const node of root.children) {
    if (!fields.includes(node.name)) fail(`不支持字段 <${node.name}>`);
    if (Object.hasOwn(result,node.name)) fail(`字段 <${node.name}> 重复`);
    if (['decisionFiles','relatedFiles'].includes(node.name)) {
      if (node.text.trim() || node.children.some(child => child.name !== 'file' || child.children.length)) fail(`<${node.name}> 内只接受 <file>相对路径</file>`);
      result[node.name] = node.children.map(child => child.text.trim());
    } else {
      if (node.children.length) fail(`<${node.name}> 应为文本；Markdown 或代码放入 CDATA`);
      const value = ['file','projectId','category','operationId','baseHash'].includes(node.name) ? node.text.trim() : node.text;
      result[node.name] = node.name === 'baseHash' && value === '' ? null : value;
    }
  }
  return result;
}

export function readWriteInput(file, command) {
  if (!file) throw Error('请用 --input 指定 XML 文件');
  const raw = fs.readFileSync(file,'utf8');
  return file.toLowerCase().endsWith('.xml') || raw.replace(/^\uFEFF/,'').trimStart().startsWith('<')
    ? parseXmlInput(raw,command)
    : JSON.parse(raw);
}
