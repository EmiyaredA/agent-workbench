import { defaultTemplate } from './template-composer.mjs';

// Project templates contain current constraints. Maintenance procedures belong to the Skill.
export const ruleTemplates=[Object.freeze(defaultTemplate())];

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
