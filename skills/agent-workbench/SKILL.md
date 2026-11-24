---
name: agent-workbench
description: 通过本机 Agent Workbench 按需读取已登记项目的约束和维护背景，并将对话中的新偏好提交为待审提案；用于跨 Agent 开发交接与项目约束查询。
---

# Agent Workbench

工作台管理文件来源与审核队列，正式约束仍保存在项目 Markdown 中。

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

所有命令输出 JSON；非零退出或返回错误时，不声称读取、提案或记录已成功。该 Skill 没有批准命令，也不授予对其他项目的修改权限。
