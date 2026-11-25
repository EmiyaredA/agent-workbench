// A three-way merge of editable files, the previous generation, and the new generation.
// Files outside the template are always preserved. Divergent edits require an explicit choice.
export function mergeTemplateDraft(current,previous,next) {
  const result=new Map(current.map(item=>[item.file,item.content]));
  const before=new Map(previous.map(item=>[item.file,item.content]));
  const after=new Map(next.map(item=>[item.file,item.content]));
  const conflicts=[];
  for(const file of new Set([...before.keys(),...after.keys()])) {
    const original=before.get(file),incoming=after.get(file),edited=result.get(file);
    if(edited===incoming || incoming===original)continue;
    if(edited===original){if(incoming===undefined)result.delete(file);else result.set(file,incoming);}
    else conflicts.push({file,current:edited??null,incoming:incoming??null});
  }
  return {files:[...result].map(([file,content])=>({file,content})),conflicts};
}

export function validOptions(field,selection) {
  return field.options.filter(option=>(option.requires??[]).every(req=>req.values.split(',').includes(selection[req.field])));
}

// Fields are ordered by their dependencies in the template, so downstream fields can be repaired once.
export function changeConfiguration(configuration,selection,key,value) {
  const next={...selection};if(key!==undefined)next[key]=value;
  for(const field of configuration.groups.flatMap(group=>group.fields)) {
    const options=validOptions(field,next);
    if(!options.some(option=>option.value===next[field.id]))next[field.id]=(options.find(option=>option.value===field.default)??options[0])?.value;
  }
  return next;
}

const resolveLink=(file,href)=>{
  if(!href || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href))return null;
  const match=href.match(/^([^?#]*)(.*)$/);let target;
  try{target=decodeURIComponent(match[1]);}catch{return null;}
  const parts=file.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part && part!=='.')parts.push(part);}
  return {file:parts.join('/'),suffix:match[2]};
};
const relativeLink=(from,to)=>{
  const base=from.split('/').slice(0,-1),target=to.split('/');let common=0;
  while(common<base.length && common<target.length && base[common]===target[common])common++;
  return [...base.slice(common).map(()=>'..'),...target.slice(common)].map(part=>encodeURIComponent(part)).join('/');
};

// Rewrite known Markdown targets, including links inside the moved file, without touching fenced examples.
export function relocateDraft(files,oldFile,newFile) {
  if(files.some(item=>item.file!==oldFile && item.file.toLowerCase()===newFile.toLowerCase()))throw Error('目标目录下已有同名文件');
  const known=new Set(files.map(item=>item.file));const warnings=new Set();
  return {files:files.map(item=>{
    const destination=item.file===oldFile?newFile:item.file;let fence=null;
    const content=item.content.split('\n').map(line=>{
      const delimiter=line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if(delimiter){if(!fence)fence=delimiter[1][0];else if(fence===delimiter[1][0])fence=null;return line;}
      if(fence)return line;
      if(/^(?: {4}|\t)/.test(line))return line;
      const rewrite=href=>{
        const link=resolveLink(item.file,href);if(!link)return href;
        if(item.file!==oldFile && link.file!==oldFile)return href;
        if(!known.has(link.file)){if(item.file===oldFile)warnings.add('移动文档含外部资料链接，请核对相对路径');return href;}
        const target=link.file===oldFile?newFile:link.file;
        return relativeLink(destination,target)+link.suffix;
      };
      return line.split(/(`+[^`]*`+)/g).map((part,index)=>index%2 ? part : part.replace(/(\]\(\s*)(?:<([^>]+)>|([^\s)]+))/g,(all,start,bracketed,plain)=>{
        const href=bracketed??plain;const changed=rewrite(href);return start+(bracketed===undefined?changed:`<${changed}>`);
      }).replace(/^(\s*\[[^\]]+\]:\s*)(?:<([^>]+)>|(\S+))/,(all,start,bracketed,plain)=>start+(bracketed===undefined?rewrite(plain):`<${rewrite(bracketed)}>`))).join('');
    }).join('\n');
    return {file:destination,content};
  }),warnings:[...warnings]};
}
