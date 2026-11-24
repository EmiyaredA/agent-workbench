import fs from 'node:fs';
import path from 'node:path';
import { atomic } from './store.mjs';
import { demoProjects, demoGlobalRules } from './demo-data.mjs';

export const demoDirectory = 'demo-v4';

export function seedDemo(store) {
  const marker = path.join(store.dataDir, 'demo-seeded');
  if (fs.existsSync(marker)) return;
  if (store.registry.projects.some(p => !p.demo)) throw Error('演示数据只能初始化到隔离的空工作区');
  const noteFile = note => `.agents/notes/${note.status}/${note.category}/${note.date}-${note.slug}.md`;
  // Resolve only explicitly authored relationships; invalid fixture references
  // fail before seeding any files rather than silently linking unrelated notes.
  for (const profile of demoProjects) {
    const slugs=new Set(profile.decisions.map(note=>note.slug));
    if(slugs.size!==profile.decisions.length)throw Error('重复的示例决策标识：'+profile.name);
    for(const item of [...profile.decisions,...profile.events])for(const slug of item.links ?? item.decisions ?? []) {
      if(!slugs.has(slug))throw Error(`示例关联决策不存在：${profile.name}/${slug}`);
    }
  }
  const root = path.join(store.dataDir, 'demo-projects');
  const projects = new Map();
  for (const profile of demoProjects) {
    const directory = path.join(root,profile.name); fs.mkdirSync(directory,{recursive:true});
    atomic(path.join(directory,'AGENTS.md'),`# ${profile.name} 开发约束\n\n> 隔离演示资料；以下项目背景、历史与方案均为示例。\n\n${profile.description}\n\n## 工作方式\n\n- 修改前确认目标文件。\n- 正式约束变更先查看具体差异，再决定是否写入。\n- 按当前任务读取相关文件，不展开所有历史记录。\n\n## 按需读取\n\n从 [约束索引](.agent-workbench/rules/index.md) 选择相关文档。入口与其他约束在看板中统一展示。\n\n## 维护背景\n\n[近期维护记录](docs/maintenance/2026-11.md) 保存背景、结果与后续。工程决策单独保存取舍，不自动成为新规则。\n`);
    const index = profile.rules.map(rule => `| ${rule.when} | [${rule.title}](${rule.file}.md) |`).join('\n');
    atomic(path.join(directory,'.agent-workbench/rules/index.md'),`# 约束索引\n\n${profile.description}\n\n| 何时读取 | 文档 |\n| --- | --- |\n${index}\n\n相关约束通过链接引用同一份正文；只读当前任务需要的文件。\n`);
    for (const rule of profile.rules) atomic(path.join(directory,'.agent-workbench/rules',rule.file+'.md'),rule.content);
    const notes=new Map(profile.decisions.map(note=>[note.slug,note]));
    const months = new Map();
    for (const event of profile.events) {
      const month = event.date.slice(0,7);
      const related = (event.decisions ?? []).map(slug=>notes.get(slug));
      const links = related.map(note=>`[${note.title}](../../${noteFile(note)})`).join(' · ');
      const files=(event.files ?? []).map(file=>`[${file}](../../${file})`).join(' · ');
      const metadata = JSON.stringify({version:1,category:event.category,decisionFiles:related.map(noteFile),relatedFiles:event.files ?? []});
      const section = `## ${event.date} · ${event.title}\n\n<!-- awb-record:${metadata} -->\n\n- **背景**：${event.background}\n- **结果**：${event.result}\n- **验证**：${event.verification}\n- **后续**：${event.next}\n${links ? '- **关联决策**：'+links+'\n' : ''}${files ? '- **关联文档**：'+files+'\n' : ''}\n`;
      months.set(month,(months.get(month) ?? '# 示例维护记录\n\n> 以下为虚构迭代与验收场景，用于演示关联阅读，不代表已执行的真实项目验证。\n\n')+section);
    }
    for (const [month,content] of months) atomic(path.join(directory,'docs/maintenance',month+'.md'),content);
    for (const note of profile.decisions) {
      const rejected = note.status === 'rejected';
      const proposed = rejected || note.status === 'proposed';
      const alternatives=note.alternatives.map(item=>`### ${item.title}\n\n${item.reason}`).join('\n\n');
      const related=(note.links ?? []).map(slug=>notes.get(slug)).map(target=>`- [${target.title}](${path.posix.relative(path.posix.dirname(noteFile(note)),noteFile(target))})`).join('\n');
      const files=(note.files ?? []).map(file=>`- [${file}](../../../../${file})`).join('\n');
      const content = `# Agent Note: ${note.title}\n\nStatus: ${note.status === 'archived' ? 'implemented' : note.status}${rejected ? ' — '+note.rejectionReason : ''}\n\n${note.supersededBy ? 'superseded_by: '+note.supersededBy+'\n\n' : ''}${note.status === 'archived' ? 'Archived: 2026-11-24\n\n' : ''}## Problem\n\n${note.problem}\n\n## ${proposed ? 'Proposal' : 'Decision'}\n\n${note.choice}\n\n## Alternatives considered\n\n${alternatives}\n\n## ${proposed ? 'Risks' : 'Consequences'}\n\n${note.consequence}\n\n${related ? '## 相关决定\n\n'+related+'\n\n' : ''}${files ? '## 关联文档\n\n'+files+'\n\n' : ''}## 示例范围\n\n这是虚构项目的决策样本；生命周期与取舍用于演示阅读，不构成真实实施或测试证据。\n`;
      atomic(path.join(directory,'.agents/notes',note.status,note.category,`${note.date}-${note.slug}.md`),content);
    }
    const project = store.registry.projects.find(p => p.root === directory) ?? store.register({name:profile.name,root:directory,demo:true});
    projects.set(profile.name,project);
  }
  const propose = (name,file,title,reason,suggestion) => {
    const project = projects.get(name); const content = store.document(project.id,file).content;
    return store.propose({projectId:project.id,file,title,reason,category:'process',source:'隔离演示：'+reason,content:suggestion(content)});
  };
  // Seed illustrative outcomes through the real store, only inside these fictional projects.
  const applied = propose('agent-workbench','.agent-workbench/rules/testing.md','关键交互保留实际操作证据','交接时需要区分构建检查与真实交互验收。',text => text+'\n- 审核写入、冲突与恢复应有可复核的操作证据。\n');
  store.apply(applied.id,applied);
  const rejected = propose('agent-workbench','.agent-workbench/rules/architecture.md','为首版引入向量数据库','希望为文档提供语义检索。',text => text+'\n- 为全部文档新增向量数据库与同步服务。\n');
  store.reject(rejected.id,'当前规模不需要额外存储与同步；先用文件和本机搜索。');
  propose('agent-workbench','AGENTS.md','保留用户已有修改','用户纠正：修改前先保留我尚未提交的工作。',text => text.replace('- 修改前确认目标文件。','- 修改前确认目标文件。\n- 保留用户已有修改，遇到冲突先展示差异。'));
  propose('agent-workbench','.agent-workbench/rules/frontend.md','使用系统字体减少运行依赖','界面应能在本机离线阅读。',text => text.replace('- 字体与图标使用本地资源。','- 使用系统字体与本地图标，不请求外部字体服务。'));
  propose('agent-workbench','.agent-workbench/rules/review.md','区分临时例外与长期偏好','一次任务的例外不应被直接扩写为长期规则。',text => text+'\n- 提案注明适用条件；临时例外留在本次维护记录，不自动推广。\n');
  const conflict = propose('agent-workbench','.agent-workbench/rules/storage.md','补充中断恢复的核对顺序','恢复时需要明确先确认实际文件，再补齐日志。',text => text+'\n- 恢复顺序：核对目标文件、核对回执、补齐维护记录。\n');
  fs.appendFileSync(path.join(projects.get('agent-workbench').root,conflict.file),'\n- 用户后续编辑：恢复前也要核对来源映射是否仍指向原文件。\n');
  try { store.apply(conflict.id,conflict); } catch(error) { if (error.status !== 409) throw error; }
  const contentUpdate = propose('portfolio','.agent-workbench/rules/content.md','展示可核对的项目结果','作品介绍需要区分个人职责与团队成果。',text => text+'\n- 介绍中明确个人职责，无法核实的数据不作为成果展示。\n');
  store.apply(contentUpdate.id,contentUpdate);
  propose('portfolio','.agent-workbench/rules/assets.md','为项目封面补充替代文本','图片未加载时，读者仍应理解作品主题。',text => text+'\n- 封面提供简短的替代文本，说明项目主题而非重复文件名。\n');
  const apiRejected = propose('api-service','.agent-workbench/rules/boundaries.md','直接复用另一服务的私有表','希望减少一次接口调用。',text => text+'\n- 允许调用方直接查询其他服务的私有表。\n');
  store.reject(apiRejected.id,'这会增加隐式依赖和版本耦合，继续使用公开接口。');
  propose('api-service','.agent-workbench/rules/api.md','错误响应补充 request_id','调用方需要将错误与服务日志关联。',text => text+'\n- 对可公开的错误返回 request_id，避免附带内部堆栈和凭据。\n');
  const globalFile = path.join(root,'global/AGENTS.md'); atomic(globalFile,demoGlobalRules);
  if (!store.registry.global) store.setGlobal(globalFile);
  store.propose({projectId:'global',file:'AGENTS.md',title:'保留反馈里的条件和例外',reason:'避免提炼后把局部要求写成绝对规则。',category:'process',source:'隔离演示：用户纠正有明确的适用条件。',content:demoGlobalRules+'\n- 提炼偏好时保留原话中的条件、否定和例外。\n'});
  fs.mkdirSync(path.join(root,'new-project'),{recursive:true});
  atomic(marker,'Decision-centered fictional demo v4; real project files are never seeded.\n');
}
