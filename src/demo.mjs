import fs from 'node:fs';
import path from 'node:path';
import { Workbench, atomic } from './store.mjs';

export function seedDemo(store) {
  const marker = path.join(store.dataDir, 'demo-seeded');
  if (fs.existsSync(marker)) return;
  if (store.registry.projects.some(p => !p.demo)) throw Error('演示数据只能初始化到隔离的空工作区');
  const root = path.join(store.dataDir, 'demo-projects');
  for (const name of ['agent-workbench', 'portfolio', 'api-service']) {
    const directory = path.join(root, name); fs.mkdirSync(directory, { recursive: true });
    atomic(path.join(directory, 'AGENTS.md'), `# 项目约束\n\n本文件定义 ${name} 项目的 Agent 工作约束，作为本地开发与协作时的统一参考。\n\n## 工作方式\n\n- 修改前确认目标文件。\n- 规则变更需先审核。\n- 按需读取模块文档。\n\n## 按任务读取\n\n- 前端开发：[前端约束](docs/agent/frontend.md)。\n- 维护背景：[维护日志](docs/maintenance/2026-11.md)。\n`);
    atomic(path.join(directory, 'docs/agent/frontend.md'), '# 前端约束\n\n## 阅读体验\n\n- 页面以文档内容为主，避免无意义的统计卡片。\n- 控件提供键盘焦点与明确的操作结果。\n\n## 验证\n\n关键交互需在真实浏览器中验收。\n');
    atomic(path.join(directory, 'docs/maintenance/2026-11.md'), '# 项目维护日志\n\n## 2026-11-24 · 确定轻量文件架构\n\n- **背景**：跨 Agent 使用时需要保留修改来由。\n- **结果**：项目约束与维护说明保留在 Markdown 中。\n- **验证**：示例内容，仅用于演示交互。\n\n## 2026-11-23 · 补充项目读取入口\n\n- **背景**：大型项目需要按模块读取约束。\n- **结果**：入口链接到前端约束与维护日志。\n- **后续**：按实际项目补充模块边界。\n');
    const item = store.registry.projects.find(p => p.root === directory) ?? store.register({ name, root: directory, demo: true });
    item.demo = true; store.saveRegistry();
    if (name === 'agent-workbench') {
      atomic(path.join(directory, '.agents/notes/implemented/architecture/2026-11-24-file-first.md'), '# Agent Note: 文件作为唯一正式来源\n\nStatus: implemented\n\n## Problem\n\n更换 Agent 后，不能依赖专有会话状态理解过去的决定。\n\n## Decision\n\n正式约束与维护记录保存在项目 Markdown 中。看板负责读取和审核，不复制另一套规则库。\n\n## Alternatives considered\n\n- **独立数据库**：检索方便，但会带来额外迁移与同步成本，因此不作为首版基础。\n\n## Consequences\n\n- 收益：文件可直接交接和版本管理。\n- 代价：不提供语义知识图谱。\n\n## Verification\n\n这是演示笔记，不能当成真实项目验收。\n');
      atomic(path.join(directory, '.agents/notes/rejected/architecture/2026-11-23-background-observer.md'), '# Agent Note: 常驻观察服务\n\nStatus: rejected — 首版不需要常驻推理\n\n## Problem\n\n希望自动发现对话中稳定的新偏好。\n\n## Proposal\n\n使用额外进程持续观察所有工具调用。\n\n## Alternatives considered\n\n- **当前 Agent 按需提炼**：上下文已有，运行负担较少，首版优先采用。\n\n## Risks\n\n持续采集增加状态与上下文管理成本；当前决定为演示。\n');
      const original = store.document(item.id, 'AGENTS.md').content;
      store.propose({ projectId: item.id, file: 'AGENTS.md', title: '保留用户已有修改', reason: '避免覆盖尚未提交的工作。', source: '演示对话：先保留我已有的修改。', alternatives: '直接覆盖文件：操作简单，但会丢失既有工作。', tradeoffs: '需要在存在冲突时重新核对差异。', content: original.replace('- 修改前确认目标文件。', '- 修改前确认目标文件。\n- 保留用户已有修改，遇到冲突先展示差异。') });
      store.propose({ projectId: item.id, file: 'docs/agent/frontend.md', title: '使用系统字体减少运行依赖', reason: '本地工作台应可离线阅读。', source: '演示提案：界面优先使用本机字体。', content: store.document(item.id, 'docs/agent/frontend.md').content + '\n- 使用系统字体，不依赖外部字体服务。\n' });
    }
  }
  const globalFile = path.join(root, 'global/AGENTS.md');
  atomic(globalFile, '# 全局偏好\n\n- 使用中文简洁沟通，明确说明改动与验证。\n- 保留用户已有修改。\n- 优先保持脚手架轻量，按需读取项目文档。\n');
  if (!store.registry.global) store.setGlobal(globalFile);
  fs.mkdirSync(path.join(root,'new-project'),{recursive:true});
  atomic(marker, 'Demo files only; user projects are never seeded.\n');
}
