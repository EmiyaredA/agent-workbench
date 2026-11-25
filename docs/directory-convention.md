# 目录与读取约定

所有项目采用同一套固定目录。路径由 `src/layout.mjs` 集中定义，登记、读取、看板和 Skill 使用相同约定。登记和查询不创建项目文件，也不迁移已有约束。

| 内容 | 位置 | 读取方式 |
| --- | --- | --- |
| 全局偏好 | 全局设置登记的一份个人 Markdown，建议名为 AGENTS.md | 全局只配置一次，独立于所有项目；不自动改宿主 Agent 配置 |
| 项目约束 | 项目根 AGENTS.md | 每次需要项目上下文时读取，保持简短 |
| 模块读取路由 | .agent-workbench/rules/index.md | 存在时随 context 返回；用 Markdown 表格写适用任务和实际文件链接 |
| 模块约束 | .agent-workbench/rules/ 下的 Markdown | 按索引或当前任务选择，用 read 展开；不全量注入 |
| 只读参考文档（可选） | referenceFiles 显式登记的既有 Markdown | 打开索引中的契约／背景链接，不加入活动约束或自动上下文，不作为约束修改目标 |
| 维护日志 | docs/maintenance/YYYY-MM.md | 按主题或时间查询，不作为当前指令 |
| 工程决策（可选） | .agents/notes/{proposed,implemented,rejected,archived}/类别/日期-主题.md | 沿用 write-notes 的既有结构；方案、否决、归档不变成约束 |
| 待审候选与回执 | 工作台数据目录 | 与正式文件隔离，未审核不进入有效上下文 |

## 看板与读取顺序

看板不区分“项目／模块”两个页面：根入口、规则索引和补充约束按真实路径显示在同一目录树，文件夹可折叠，按文件直接打开。全局偏好保留独立入口。下面的入口／索引／正文是读取策略，CLI 返回字段保持兼容，不增加界面层级。

## 读取顺序与关联

`全局入口 → 项目 AGENTS.md → 模块根 index.md → 当前任务相关模块 → 必要的维护背景`。

这个顺序控制读取范围，不是用路径优先级自动解决语义冲突。冲突保留来源并交由用户决定；不得用模块文本悄悄覆盖全局约束。

`context` 的 `rules` 返回全局与项目入口正文，`indexes` 返回已存在且未被替代的标准模块根索引，`modules` 仅返回可展开的文件索引。嵌套模块可在根索引链接自身 index.md，再按需逐层读取。没有索引时返回已有模块列表，不自动造文件。

模块之间用相对 Markdown 链接指向同一份共用约束，在链接旁写清“何时还需要读”。不增加 depends_on 配置、规则包安装器或依赖图引擎。索引链接不会扩大文件读取权限；工作台只读取登记的入口、目录和只读参考文件，越界或不存在的文件明确报错。

## 固定读取边界

常规读取只枚举标准项目入口、模块目录、维护目录、决策目录，以及显式登记的只读参考文件。README、其他 docs、研究草稿不因是 Markdown 就自动进入看板检索或有效约束。扫描有文件数、目录项数和深度上限；触限给出不完整提示。

项目登记只需名称和已有目录。约束入口、模块目录和维护目录均不可更改；设置仅维护项目名称和只读参考文件。旧目录映射不会影响标准来源，`.trellis`、`docs/agent` 等目录不自动发现或读取。清理设置不搬动或删除项目文件。

## 模板与审核

2026-11-25 起，看板“修改并记录”与 CLI change 支持获授权的约束迭代，保存完整前后版本并同步写事实日志；需要先讨论时仍可采用下述提案路径。两种方式不改变已有文件目录，不把普通日志当有效规则。

[项目入口模板](../templates/project/AGENTS.md)与[模块索引模板](../templates/project/.agent-workbench/rules/index.md)供按需采用。只有 AGENTS.md 也可以工作，不需要预建空目录。它们不是一键初始化命令；要通过看板采用时，将模板作为完整建议内容提交到对应目标，经审核后写入。

本仓库自己当前已有 docs/design 等文档入口，保留现有 AGENTS.md，未把模板自动安装进本仓库或其他真实项目。

决策笔记的三种正文模板位于 Skill 的 `assets/notes/`，写作、状态移动和约束审核边界见 [决策参考](../skills/agent-workbench/references/decision-notes.md)。`notes --action verify` 校验标准目录及归档清单；`archive` 只读生成计划，`apply` 显式执行并支持回执重试。归档清单位于 `.agents/notes/archived/manifest.json`，工作台本机的中断回执位于数据目录 `note-archives/`，不另存一套正式笔记。

## 上游代码依据

- mini-trellis 0f37e0f2 的[入口模板](https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/markdown/agents.md)明确使用 .trellis/spec，并先读 index.md；[读取说明](https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/markdown/spec/guides/mini-memory.md.txt)区分规范、研究和日志。工作台采用“固定目录、索引先行”的思路，以自己的 .agent-workbench/rules 作为默认路径，继续使用 core 的替代关系与查询原语；core 的 discoverDocs 范围更广，因此不用于常规约束读取。
- CE fcb5e3a 的[规则模板](https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-setup/assets/pack-rule-template.md)使用 title、applies_when 并限定顶层规则文件。这里吸收“说明何时读”，用普通索引表表达，不移植规则包解析和元数据格式。
- ECC 4adeee67 的[作用域说明](https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/skills/continuous-learning-v2/SKILL.md)分别保存项目与全局内容。这里保留作用域隔离，不采用观察服务或置信度生效机制。
- write-notes-like-deepseek 的本地 scripts/agent-note-tree.ts 和 SKILL.md 按生命周期／类别固定 .agents/notes，引用使用相对 Markdown 链接。本项目兼容其历史记录，不把它的决策生命周期当成活动规则状态。

本轮直接复核了以上本地源码；前三个上游的提交与原研究台账一致。未重新拉取最新版本，也没有把上游 Skill 指令应用到用户项目。
