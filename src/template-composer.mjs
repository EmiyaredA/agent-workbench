import fs from 'node:fs';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const directory=new URL('../templates/default/',import.meta.url);
const list=value=>value===undefined ? [] : Array.isArray(value) ? value : [value];
const xml=fs.readFileSync(new URL('template.xml',directory),'utf8');
if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw Error('默认模板 XML 无效');
const definition=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseAttributeValue:false}).parse(xml).template;
const groups=list(definition.group).map(group=>({id:group.id,label:group.label,icon:group.icon,fields:list(group.field).map(field=>({id:field.id,label:field.label,default:field.default,options:list(field.option).map(option=>({value:option.value,label:option.label,requires:list(option.requires)}))}))}));
const fields=groups.flatMap(group=>group.fields);
const matches=(requirements,selection)=>list(requirements).every(req=>String(req.values).split(',').includes(selection[req.field]));
export const templateConfiguration={groups,defaults:Object.fromEntries(fields.map(field=>[field.id,field.default]))};

export function composeDefault(selection) {
  if (!selection || typeof selection!=='object' || Array.isArray(selection)) throw Error('请提供完整技术配置');
  if (Object.keys(selection).some(key=>!fields.some(field=>field.id===key))) throw Error('技术配置包含未知字段');
  for (const field of fields) {
    const option=field.options.find(option=>option.value===selection[field.id]);
    if (!option || !matches(option.requires,selection)) throw Error(`${field.label}配置不兼容，请重新选择`);
  }
  const files=[];const links=[];
  for (const module of list(definition.module)) {
    if (!matches(module.requires,selection)) continue;
    const parts=list(module.part).filter(part=>matches(part.requires,selection));
    if (!parts.length) continue;
    const body=parts.map(part=>{
      if (!/^rules\/[a-z-]+\.md$/.test(part.source)) throw Error('模板规则来源无效');
      const content=fs.readFileSync(new URL(part.source,directory),'utf8').trim();
      if (!content) throw Error(`模板规则为空：${part.source}`);
      return content;
    }).join('\n\n');
    files.push({file:module.file,content:`# ${module.title}\n\n${body}\n`});
    if (module.file!=='AGENTS.md') links.push(`| ${module.when} | [${module.title}](<${path.posix.relative('.agent-workbench/rules',module.file)}>) |`);
  }
  files.splice(1,0,{file:'.agent-workbench/rules/index.md',content:'# 约束索引\n\n按任务选读相关模块，不要求展开全部约束。\n\n| 何时读取 | 文档 |\n| --- | --- |\n'+links.join('\n')+'\n'});
  return {selection:{...selection},files};
}

export function defaultTemplate() {
  const resources=list(definition.resource).map(resource=>{
    if(!/^guides\/[a-z-]+\.md$/.test(resource.source))throw Error('文档参考来源无效');
    return {name:resource.name,content:fs.readFileSync(new URL(resource.source,directory),'utf8')};
  });
  return {id:'default',name:'默认模板',description:'通用约束与按技术配置组合的项目规则',builtin:true,configuration:templateConfiguration,resources,...composeDefault(templateConfiguration.defaults)};
}

// Only known small manifests and entrypoints are inspected; never run project code or read runtime secrets.
export function detectTemplateContext(root) {
  const evidence=[];const warnings=[];const detected={};
  const read=relative=>{
    let current=root;
    for (const part of relative.split('/')) {
      current=path.join(current,part);
      let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')warnings.push(`无法读取：${relative}`);return null;}
      if (stat.isSymbolicLink()) {warnings.push(`跳过符号链接：${relative}`);return null;}
    }
    try {
      const stat=fs.lstatSync(current);
      if(!stat.isFile() || stat.size>128_000){warnings.push(`跳过非普通或过大的文件：${relative}`);return null;}
      return fs.readFileSync(current,'utf8');
    } catch {warnings.push(`无法读取：${relative}`);return null;}
  };
  const set=(values,file)=>{Object.assign(detected,values);evidence.push({file,fields:Object.keys(values)});};
  for (const relative of ['web/package.json','frontend/package.json','package.json']) {
    const text=read(relative);if(!text)continue;
    let json;try{json=JSON.parse(text);}catch{warnings.push(`无法解析 ${relative}`);continue;}
    const deps={...json.dependencies,...json.devDependencies};
    const frameworks=['react','vue'].filter(name=>deps[name]);
    let framework=frameworks.length===1 ? frameworks[0] : null;
    if(frameworks.length>1) {
      const folder=relative.slice(0,relative.lastIndexOf('/')+1);
      const entries=['src/main.tsx','src/main.ts','src/app/main.tsx','src/app/main.ts'].map(file=>read(folder+file)).filter(Boolean).join('\n');
      const react=/from\s*["']react(?:-dom)?(?:\/client)?["']/.test(entries);const vue=/from\s*["']vue["']/.test(entries);
      if(react!==vue)framework=react?'react':'vue';else warnings.push(`${relative} 含多个前端框架，请手动确认`);
    }
    if(framework && deps.typescript)set({frontendLanguage:'typescript',frontendFramework:framework},relative);
    if(detected.frontendFramework)break;
  }
  const go=read('go.mod');
  const pythonFiles=['pyproject.toml','python/pyproject.toml'];
  const python=pythonFiles.map(file=>({file,text:read(file)})).find(item=>item.text && /["']fastapi(?:[<>=\["'])/i.test(item.text));
  if(go?.includes('github.com/zeromicro/go-zero') && python) warnings.push('发现多种后端，请手动确认后端配置');
  else if(go?.includes('github.com/zeromicro/go-zero')) {
    set({backendLanguage:'go',backendFramework:'gozero'},'go.mod');
    const pg=/gorm\.io\/driver\/postgres/.test(go),sqlite=/gorm\.io\/driver\/sqlite/.test(go);
    if(pg!==sqlite)set({database:pg?'postgres':'sqlite'},'go.mod');
    if(/redis\/go-redis|go-redis\/redis/.test(go))set({cache:'redis'},'go.mod');
  } else if(python) {
    set({backendLanguage:'python',backendFramework:'fastapi'},python.file);
    const pg=/["'](?:asyncpg|psycopg)[\[<>=\w"']/i.test(python.text),sqlite=/["']aiosqlite[<>=\w"']/i.test(python.text);
    if(pg!==sqlite)set({database:pg?'postgres':'sqlite'},python.file);
    set({cache:/["']redis[\[<>=\w"']/i.test(python.text)?'redis':'none'},python.file);
  }
  // Storage is deliberately not inferred from database choice or absence of an SDK.
  return {detected,evidence,warnings};
}
