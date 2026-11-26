---
name: agent-workbench
description: 使用本机工作台读取项目约束、更新约束并留档、记录重要修改和维护工程决策。
---

# Agent Workbench

通过 CLI 维护已登记项目，结果在看板中查看；文档内容的写作要求遵循全局／项目 AGENTS.md。

Skill 资源链接相对所在文档，项目文档之间也用相对链接；CLI 的 `--file` 相对项目根目录，不写死本机绝对路径。

## 调用

需要 Node.js 24+。以下命令从任意目录运行；`--data` 与看板保持一致，默认使用工作台 `.runtime/workbench`。复制安装 Skill 后，设置 `AGENT_WORKBENCH_ROOT` 指向工作台仓库。

```sh
node <skill目录>/scripts/workbench.mjs projects
node <skill目录>/scripts/workbench.mjs <命令> --project <项目ID或目录> [其他参数]
```

项目由用户在看板登记；全局约束读改使用 `--project global`，maintenance／record 仅用于项目。

## 读取

| 命令 | 用法 |
| --- | --- |
| `context` | 先取入口、索引和模块列表，再按当前任务展开 |
| `read --file <相对路径>` | 读取选定文档及 hash |
| `journal --query <关键词>` | 查询实际修改记录 |
| `maintenance --query <关键词>` | 查询工程决定及关联迭代 |

## 更新约束

- 根 AGENTS.md 作入口，详细约束优先放 `.agent-workbench/rules/`，索引维护相对链接；新增、合并或删减时同步修复引用，已有外部文档按当前授权整理。
- 文件的新增、移动、重命名、移除及模板复用，可在看板“约束 → 整体编辑”完成：选择目录和文件，核对整套差异后保存。
- CLI 修改先 read 获取 hash，填写[直接修改模板](assets/constraints/change.xml)或[提案模板](assets/constraints/propose.xml)；content 放完整新正文，用 CDATA 保留 Markdown。
- 按当前授权和项目约定，用 `change --input <XML>` 直接修改并留档，另带 `baseHash、operationId`（新文件保留空 baseHash 标签）；需要审核时用 `propose --input <XML>` 提交，由用户在看板确认具体差异。
- 不先覆盖文件再补记录。原文变化时重读；已完成请求重试保持原输入和 operationId，新的修改另用新标识。

## 维护记录与工程决策

- 重要修改用 `record --input <XML>` 留档，输入含 title、category、background、result，可补 verification、next 和关联文档。从[维护记录输入模板](assets/maintenance/record.xml)开始，字段和重试见[维护记录写作与更新](references/maintenance-records.md)。约束保存已自动留档，同一修改不重复 record。
- 工程决定放 `.agents/notes/`，按[决策写作与流转](references/decision-notes.md)选择[模板](assets/notes/proposed.md)、更新状态和链接。完成后运行 `notes --action verify`；归档时再读[校验与归档](references/note-operations.md)。
- 实际日志保存在 `docs/maintenance/`；日志和决定不自动成为项目约束。category 从 architecture、feature、bug-fix、simplification、process、testing 中选择。

命令输出 JSON；报错或非零退出时先处理具体错误，不报告成功。CLI 没有约束批准命令。

## 架构图

用 `architecture` 查询、校验和导入架构版本，具体字段见[架构版本](references/architecture.md)与[XML 模板](assets/architecture/version.xml)。由 Agent 阅读源码生成；看板联动展示目录、图示、文档与独立代码片段。导入为候选，核对后在看板采用。

## 需求验收

用 `acceptance` 查询需求、更新标准和追加实际验证，读取[验收流程](references/acceptance.md)与 XML 示例。需求与验证共存于项目 `docs/需求/` 的 Markdown，关联决定后可在看板双向追溯。
