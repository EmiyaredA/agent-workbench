# 本机接口与 CLI

服务默认 `http://127.0.0.1:4173`，仅本机使用。接口返回 JSON，错误为 `{ "error": "可读说明" }`。400 表示输入无效，404 表示未登记或不存在，409 表示版本／状态冲突，423 表示另一项写入尚未完成。

所有写请求要求当前 UI 的同源 `Origin` 与 `X-Workbench-Nonce`。页面从 `GET /api/session` 获取会话 nonce；服务重启后需刷新。批准入口用于看板交互，Skill 和 CLI 不提供批准命令。

| 请求 | 行为 |
| --- | --- |
| `GET /api/skill` | 默认读取仓库 Skill；`file` 仅接受该 Skill 主文、三份参考和三份模板的固定白名单路径，返回原文与绝对路径；只读，不接受任意文件路径 |
| `GET /api/session` | 本机 UI 会话、数据目录与运行模式 |
| `GET /api/state` | 已登记项目、全局来源、提案摘要、恢复提示；只读 |
| `POST /api/projects/inspect` | 输入 `root`，检查已存在目录与已发现的来源，不登记、不写项目 |
| `POST /api/projects` | 登记 `root`、`name`；可指定 `ruleFiles`、`ruleRoots`、`journalDir` |
| `GET /api/projects/:id` | 项目来源、文档索引与扫描提示 |
| `PATCH /api/projects/:id` | 更新名称和来源映射，不改原文档 |
| `DELETE /api/projects/:id` | 解除登记，不删除文件；待审或冲突提案须先处理 |
| `POST /api/global` | `file` 为已有 Markdown 绝对路径；空值解除映射 |
| `GET /api/projects/:id/document?file=…` | 读取已发现文档或登记入口，返回内容、存在状态和 hash |
| `GET /api/projects/:id/context?query=…` | rules 为全局／项目正文，indexes 为模块根索引正文，modules 为文件索引；不返回候选 |
| `GET /api/projects/:id/search?q=…&kind=…` | 当前项目检索；kind 为 all/document/proposal/journal，最多30条，带来源与截断提示 |
| `GET /api/projects/:id/maintenance` | 只读解析决策摘要、迭代和明确引用；返回 `notes`、`entries`、`warnings`，不写索引或变更状态 |
| `GET /api/projects/:id/journal` | 解析配置目录和已有 mini-trellis workspace 中的日志 |
| `POST /api/projects/:id/journal` | 追加事实记录，不能指定任意落盘目标 |
| `POST /api/proposals` | 创建候选，不改目标文件 |
| `GET /api/proposals/:id` | 候选、基线、当前原文及真实差异 |
| `POST /api/proposals/:id/revise` | 输入 `content`、`contentHash`，可补 `reason`；编辑后需重新审核 |
| `POST /api/proposals/:id/apply` | 输入已查看的 `baseHash`、`contentHash`；核对目标映射与当前原文后写入 |
| `POST /api/proposals/:id/reject` | 必填 `reason`，不改目标文件 |
| `POST /api/proposals/:id/rebase` | 以当前原文新建待审版本，保留旧提案关联；没有剩余差异时关闭旧候选 |

项目 ID 来自登记结果或 CLI `projects`；全局来源的 ID 为 `global`。提案状态为 pending、applied、rejected、conflict、superseded；工程笔记的 implemented 等生命周期独立呈现。差异查询中的 `applicationPending` 表示批准写入曾中断：此时候选冻结，可重试补齐记录，不能编辑、拒绝或重提。

候选必需：`projectId`、目标相对路径 `file`、`title`、`reason`、`source` 和完整新文本 `content`。可补 `alternatives`、`tradeoffs`。候选正文最多500 KB（按 UTF-8 字节），不会因保存而生效。

维护记录必需 `title`、`background`、`result`，可补 `verification`、`next`、`topic`、`alternatives`、`tradeoffs`。写入配置维护目录下的当月 Markdown；`journalFile` 等未知输入不能改变目标位置。

只读 CLI 不需要启动服务；与看板共用数据目录。写入共用存储层的跨进程互斥，约束写入中断后由服务启动恢复；GET 与 CLI 读取不触发恢复。锁与回执不是对其他同用户文件程序的系统沙箱。

## 决策笔记 CLI（无新增 HTTP 写接口）

`notes --project <ID或目录> --action verify|archive|apply` 与 Skill wrapper 共用已登记项目解析，不接受 global；可指定相同的 `--data`。

- `verify [--base-ref <提交>]`：只读校验路径、状态、章节、相对 Markdown 链接、归档封印及 Git 历史清单。返回 `{ok,notes,errors,warnings}`，校验失败退出码1。无 Git 明确降级为当前磁盘哈希核对。
- `archive --file <项目相对路径> [--successor <项目相对路径>]`：只读生成 JSON 计划，包含 `version/projectId/root/file/target/successor/date/changes/inbound/warnings`；changes 为完整 before／after 文本，未创建或删除用 null 表达。仅支持 implemented，接管者也必须为另一篇 implemented。不覆盖目标或重置封印。
- `apply --input <计划JSON>`：重新核对精确计划后执行归档，不是约束批准。拒绝写入已登记规则。返回 `{ok,operationId,replayed,inbound}`；原文或计划变化即失败。中断意图与完成回执保存在数据目录 `note-archives/`，需用同一计划和数据目录显式重试，不由 GET 或服务启动顺带恢复。外部修改不覆盖，完整回执重放不再次写文件。

写作与状态流转仍由 Agent 文件操作完成；校验不证明取舍的语义真实性。归档后仍需修复旧入站链接、再次 verify 并 record 事实。实现和使用见 [决策流程](../skills/agent-workbench/references/decision-notes.md) 与 [归档参考](../skills/agent-workbench/references/note-operations.md)。

## 维护记录与交接

`maintenance --project <ID或目录> [--query <关键词>]` 与 HTTP 查询共用解析，返回摘要及来源，完整决策正文用 `read` 展开。`notes` 包括 `file/title/status/category/date/summary/sections/alternatives/rejectionReason/links/inbound/entryKeys`；`entries` 保留原文并补 `key/date/category/background/result/verification/next/links`。章节摘要最长360字，完整原文不受摘要截断影响。日期未标注时不推测；笔记日期表示首次提出，不表示实施时间。

日志追加兼容旧字段，新增可选：

- `category`：architecture、feature、bug-fix、simplification、process、testing，留空为未分类。
- `decisionFiles`、`relatedFiles`：最多各30个已发现的 Markdown 项目相对路径；前者必须为决策笔记。
- `operationId`：1–80位字母、数字、下划线或连字符；一次真实操作使用一个稳定值。

示例：

```json
{"title":"完成目录树交互","background":"便于查找约束","result":"文件按真实目录展示","verification":"隔离浏览器完成展开与折叠检查","next":"观察文件增多后的体验","category":"feature","decisionFiles":[".agents/notes/implemented/feature/2026-11-24-directory-tree.md"],"relatedFiles":["AGENTS.md"],"operationId":"directory-tree-session-1"}
```

返回 `{file,key,replayed}`。同项目、相同标识与相同内容重试返回原记录；同标识不同内容返回409。标识与内容摘要随日志保留，跨进程与跨月文件可核对；调用方不提供标识时仍每次产生新记录。改变维护来源映射后不承诺在旧来源之外查找旧标识；扫描不完整时阻止带标识的写入，避免误判不存在。

新日志保留可直接阅读的相对 Markdown 链接，类别和重试信息放在版本化注释中。读取旧日志无需迁移；不按相似标题或同名文件推测关联。决策替代字段 `superseded_by` 使用项目相对路径，目标须为已发现的另一篇决策；无效或缺失时给出提示。归档目录或 `Archived: YYYY-MM-DD` 标记独立于 `Status: implemented` 识别；看板不创建或校验归档封存清单。

避坑卡片使用 `alternatives: [{title,reason}]`，从原文备选章节的列表、三级标题或段落中逐条解析，保留作者写明的名称与理由；`rejectionReason` 来自明确的 Status 否决说明。标题与理由分别保留最多160／1600字的展示内容（无独立标题时取80字摘要）；完整原文仍可通过文档接口读取。没有说明的原因不自动补写，也不按“有备选”推定方案已采纳。此为只读派生字段，不改写原笔记或引入第二份内容。
