---
name: agent-workbench
description: 通过本机 Agent Workbench 读取已登记项目的约束、提交约束提案，并维护工程决策笔记的写作、状态、校验与归档；用于项目约束查询、重要技术取舍和开发交接，跳过普通机械改动。
---

# Agent Workbench

工作台管理文件来源与审核队列，正式约束仍保存在项目 Markdown 中。

项目与用户的已有约定优先。决策笔记保存工程来由，不能借写笔记、状态流转或归档直接新增、修改、删除有效约束；约束仍走下文提案审核。用户已授权的工程工作继续执行，不照搬上游对每一步重新确认的流程。

从任意工作目录运行本 Skill 的 `scripts/workbench.mjs`。仓库内使用会自动定位工作台；若 Skill 被复制安装到其他位置，设置 `AGENT_WORKBENCH_ROOT` 指向工作台仓库。`AGENT_WORKBENCH_DATA` 或 `--data` 应与看板使用同一数据目录，默认是工作台的 `.runtime/workbench`。Node.js 24+，工作台先执行 `npm ci`。

## 按需读取

```sh
node <skill目录>/scripts/workbench.mjs projects
node <skill目录>/scripts/workbench.mjs context --project <项目ID或目录>
node <skill目录>/scripts/workbench.mjs read --project <项目ID或目录> --file .agent-workbench/rules/frontend.md
node <skill目录>/scripts/workbench.mjs journal --project <项目ID或目录> --query <关键词>
node <skill目录>/scripts/workbench.mjs maintenance --project <项目ID或目录> --query <关键词>
```

`context` 的 `rules` 返回全局／项目入口正文，`indexes` 返回 `.agent-workbench/rules/index.md` 等已登记模块根索引的正文，`modules` 只给出可展开文件。先按索引的任务条件选择模块，再用 `read` 展开；模块引用共用规则时读取链接目标，不复制另一份正文。不默认读取全部模块、历史日志或原始会话。不把维护背景、被否决方案和被替代说明当成有效指令。没有登记的项目需由用户在看板登记，不自行扩大读取范围。

新项目固定使用根 `AGENTS.md`、`.agent-workbench/rules/` 和 `docs/maintenance/`；已有项目以登记映射为准，不额外猜测或扫描其他规则目录。小项目可只有入口文件，目录和模块索引不存在不代表需要自动创建。需要新入口时可参考工作台仓库的 `templates/project/`，仍通过提案审核写入。

## 提出新约束

遇到明确纠正、稳定偏好或值得长期保留的边界时，先对照已有文件；重复、临时任务要求或已能从代码看出的事实不必生成规则。保留原话中的条件、例外与否定。局部习惯留在项目范围，推广到全局另提案。

将候选写入临时 JSON 文件，包含 `file`（目标相对路径）、`title`、`reason`、`source`、`content`（该目标文件完整的新文本）。项目由 `--project` 指定；来源只保留必要摘要或引用，不复制完整对话。

```sh
node <skill目录>/scripts/workbench.mjs propose --project <项目ID或目录> --input <候选JSON文件>
```

成功只表示进入待审队列。告诉用户提案标题和 ID，由用户在看板查看准确差异后批准。不要直接改写正式约束、调用批准接口或把候选描述为已生效。冲突时保留用户新编辑，重新核对后再提交。

## 维护背景

重要变更完成后，可通过 `record --project <项目ID或目录> --input <记录JSON文件>` 留档。记录包含 `title`、`background`、`result`；可补 `verification`、`next`、`topic`、`alternatives`、`tradeoffs`。仅记录已发生的事实，明确缺失验证。普通维护日志不会自动变成约束。

`maintenance` 返回决策摘要、来源、引用和关联迭代；需要完整取舍时再用 `read` 读取选定笔记。决策首次提出日不等于实际落地日。归档和被替代笔记只作为历史，不能通过引用数量推定其是有效约束。

`record` 可补 `category`（architecture／feature／bug-fix／simplification／process／testing）、`decisionFiles`（已有决策的项目相对路径数组）、`relatedFiles`（已登记 Markdown 路径数组）。关联必须来自实际阅读，不按标题相似猜测。不要求每次小修改另建决策笔记。

为一次记录生成稳定 `operationId`，响应丢失或超时后原样重试；同一标识不同内容会被拒绝。下一次真实迭代使用新标识。记录事实不会改变决策实施状态，不会批准约束。外部直接改约束尚无自动送审或最后已审快照，优先走候选审核。

## 工程决策笔记

重要行为、架构、跨文件契约、工具流程、测试策略或持久化／网络格式发生变化，且理由值得后续维护者保留时，维护对应决策。纯排版、无行为变化的样式和补丁不新建笔记；有现成决定时优先同步那一篇的事实。不为凑备选方案编造历史，不要求每次记录迭代都新建决策。

1. 用 `maintenance --query` 定位相关决定，再 `read` 正文；必要时在已登记项目的 `.agents/notes/` 下用 `rg --hidden --glob '!archived/**'` 按模块检索。新增前处理命中的重叠、冲突和过时方案，不全量加载历史。
2. 写作和状态变化时读 [决策写作与流转](references/decision-notes.md)，按 [模板](assets/notes/proposed.md) 起草。仅在首次需要时创建对应目录。计划写在 proposed；已有实现才转 implemented；否决保留真实原因。决定翻转新开并互链，不覆盖旧篇的核心理由。
3. 写完运行下列校验，再检查理由、真实备选、收益／代价和验证缺口。脚本检查结构和链接，不代替语义判断或约束人审。
4. 仅在需要封存已落地决定时读 [校验与归档](references/note-operations.md)。先生成含完整前后文本的计划，核对适用范围、接管内容与链接，再在已有任务授权范围执行；没有治理授权时先交用户审阅。部分替代、仍持有当前边界的决定保留活跃。

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action archive --file .agents/notes/implemented/architecture/YYYY-MM-DD-topic.md --successor .agents/notes/implemented/architecture/YYYY-MM-DD-successor.md > <临时计划.json>
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action apply --input <临时计划.json>
```

`archive` 只读生成计划，`apply` 仅执行笔记归档，不是约束批准命令。沿用相同 `--data`。完成后修复入站链接、再校验，并用 `record` 关联实际决策路径；只写事实摘要，不复制笔记正文。看板仍只读展示决策，不提供编辑或归档按钮。

参考 write-notes-like-deepseek 的固定版本与取舍见 [来源说明](references/note-sources.md)。工具随工作台分发，不依赖上游本机路径或 tsx。

所有命令输出 JSON；非零退出或返回错误时，不声称读取、提案、记录或归档已成功。该 Skill 没有约束批准命令，也不授予对其他项目的修改权限。
