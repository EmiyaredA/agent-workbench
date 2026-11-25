import fs from 'node:fs';

// Project templates contain current constraints. Maintenance procedures belong to the Skill.
const projectFile=file=>({file,content:fs.readFileSync(new URL('../templates/project/'+file,import.meta.url),'utf8')});
const root=projectFile('AGENTS.md');
const index=projectFile('.agent-workbench/rules/index.md');
const modules=[
  ['architecture','调整目录、模块职责、依赖或公开接口','架构边界'],
  ['development','编写代码、修改依赖或开发检查','开发约定'],
  ['runtime','修改运行方式、持久化或恢复流程','运行与数据'],
  ['delivery','验证、交付或提交修改','交付检查'],
];
const modularIndex={...index,content:'# 约束索引\n\n按当前任务读取相关项目约束，不默认展开全部模块。\n\n| 何时读取 | 文档 |\n| --- | --- |\n'+modules.map(([file,when,title])=>`| ${when} | [${title}](${file}.md) |`).join('\n')+'\n'};
export const ruleTemplates=[
  {id:'minimal',name:'精简项目约束',description:'项目入口与索引，适合小项目',files:[root,index]},
  {id:'modular',name:'模块化项目约束',description:'项目架构、开发、运行与交付约束，不包含维护历史',files:[root,modularIndex,...modules.map(([file])=>projectFile('.agent-workbench/rules/'+file+'.md'))]},
].map(template=>Object.freeze({...template,builtin:true}));

// Compatibility cleanup for the retired, generated board-description block.
// Authored index text outside the explicit markers remains untouched.
export function stripLegacyDescriptions(content) {
  return content.replace(/\n?<!-- awb:structure:start -->[^]*?<!-- awb:structure:end -->\n?/g,'');
}
export function indexWithModules(content,files) {
  const clean=stripLegacyDescriptions(content);
  const targets=new Set([...clean.matchAll(/\]\(<?([^\s)>]+)>?\)/g)].map(([,href])=>{try{return decodeURIComponent(href.replace(/^\.\//,''));}catch{return href;}}));
  const links=files.filter(item=>item.file.startsWith('.agent-workbench/rules/') && item.file!=='.agent-workbench/rules/index.md').flatMap(item=>{
    const relative=item.file.slice('.agent-workbench/rules/'.length);
    const href=relative.split('/').map(encodeURIComponent).join('/');
    return targets.has(relative) ? [] : [`- [${relative}](<${href}>)`];
  });
  return links.length ? clean.trimEnd()+'\n\n'+links.join('\n')+'\n' : clean;
}
