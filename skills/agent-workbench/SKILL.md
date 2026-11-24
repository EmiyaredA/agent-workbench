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
node <skill目录>/scripts/workbench.mjs read --project <项目ID或目录> --file docs/agent/frontend.md
node <skill目录>/scripts/workbench.mjs journal --project <项目ID或目录> --query <关键词>
```

`context` 返回全局／项目约束正文和模块索引；根据当前任务选择模块，再用 `read` 展开。不默认读取全部模块、历史日志或原始会话。不把维护背景、被否决方案和被替代说明当成有效指令。没有登记的项目需由用户在看板登记，不自行扩大读取范围。

## 提出新约束

遇到明确纠正、稳定偏好或值得长期保留的边界时，先对照已有文件；重复、临时任务要求或已能从代码看出的事实不必生成规则。保留原话中的条件、例外与否定。局部习惯留在项目范围，推广到全局另提案。

将候选写入临时 JSON 文件，包含 `file`（目标相对路径）、`title`、`reason`、`source`、`content`（该目标文件完整的新文本）。项目由 `--project` 指定；来源只保留必要摘要或引用，不复制完整对话。

```sh
node <skill目录>/scripts/workbench.mjs propose --project <项目ID或目录> --input <候选JSON文件>
```

成功只表示进入待审队列。告诉用户提案标题和 ID，由用户在看板查看准确差异后批准。不要直接改写正式约束、调用批准接口或把候选描述为已生效。冲突时保留用户新编辑，重新核对后再提交。

## 维护背景

重要变更完成后，可通过 `record --project <项目ID或目录> --input <记录JSON文件>` 留档。记录包含 `title`、`background`、`result`；可补 `verification`、`next`、`topic`、`alternatives`、`tradeoffs`。仅记录已发生的事实，明确缺失验证。普通维护日志不会自动变成约束。

所有命令输出 JSON；非零退出或返回错误时，不声称读取、提案或记录已成功。该 Skill 没有批准命令，也不授予对其他项目的修改权限。
