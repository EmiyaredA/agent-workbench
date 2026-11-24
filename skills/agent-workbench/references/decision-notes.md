# 决策写作与状态流转

## 先确定这次是在维护什么

笔记保存“为什么选这条路、放弃了什么”，月度日志保存“这一次实际改了什么、怎样验证、还有什么没完成”。同一决定可关联多次迭代，不复制两份正文。笔记中的工程结论不是新的有效指令；若要形成项目、模块或全局约束，另外提交约束提案并等待用户审阅具体差异。

只在已登记且当前任务获授权的项目中操作。先读项目 AGENTS.md 与现有决定，已有文件受约束审核保护时也必须走提案。默认笔记目录 `.agents/notes/` 与看板一致；已有其他 ADR 布局时保留原布局，不默默迁移，但本工具与看板当前只支持标准笔记目录，不能声称已覆盖其他布局。

## 写入前检索

用 maintenance 查询并 read 命中笔记，也可在 `.agents/notes/` 中以 `rg --hidden --glob '!archived/**' '<机制名>' .` 查 proposed、implemented、rejected。顺着代码已有 Note 注释或模块文档链接阅读，不为检索强行补注释。归档只在明确追溯历史时展开。

对本次命中说明：无关则略过；部分重叠双方互链；事实更新且理由不变则原地维护；核心理由翻转则新建；旧提案不再推进则否决。保留仍然独有的边界、风险和重引入条件，不能因文档老旧就判过时。没有检索到真实备选或历史理由时明确缺失，不伪造补齐。

## 文件与模板

路径为 `.agents/notes/{生命周期}/{类别}/YYYY-MM-DD-topic.md`，日期保持首次提出日。六类：feature（行为与能力）、bug-fix（缺陷与复盘）、simplification（删减收敛）、architecture（结构与边界）、process（工具与流程）、testing（验证策略）。只建用到的目录，不维护集中 INDEX.md。

| 生命周期 | 头部状态 | 正文骨架 | 模板 |
| --- | --- | --- | --- |
| proposed | `Status: proposed` | Problem → Proposal → Alternatives considered → Acceptance criteria → Risks | [方案稿](../assets/notes/proposed.md) |
| implemented | `Status: implemented` | Problem → Decision → Alternatives considered → Consequences，可加 Verification | [已落地](../assets/notes/implemented.md) |
| rejected | `Status: rejected — 原因` | 保留 Problem、Proposal 和真实备选，说明否决及重新考虑的条件 | [否决](../assets/notes/rejected.md) |
| archived | 保留 `Status: implemented`，下一行加 `Archived: YYYY-MM-DD` | 冻结归档时的正文 | 仅由归档工具生成 |

头部固定为第一行 `# Agent Note: 标题`、第二行空白、第三行 Status、第四行空白。归档多插一行 Archived，空白顺延。正文可中文，模板使用英文节名以便跨工具读取；校验兼容常用中文别名，但不继承上游历史豁免和自动补封印选项。

## 正文质量

- Problem 写清触发、边界和不处理的后果，脱离具体方案也能独立成立。
- Proposal／Decision 具体到能行动；Decision 描述当前实际行为，计划和未知项不冒充结果。
- Alternatives considered 只列真实权衡过的选项。每项先写其成立的最强理由，再写在本项目条件下为何不选。不为了达到数量编造“维持现状”。
- Consequences 同时记录收益、代价、已知上限及何时重访。无测量基线不声称性能提升。
- Verification 记录实际命令、可观察结果和未验证部分。小节存在不等于验收通过。
- 关联用相对 Markdown 链接，正文保留必要背景和短引述，不复制完整对话或秘密数据。

## 状态流转

| 情况 | 同一次工作中要完成的动作 |
| --- | --- |
| 尚未落地的方案 | 写 proposed，列验收标准与风险；根据已有授权继续实施，未决定的关键取舍再问用户。 |
| proposed → implemented | 实现存在后移到 implemented 同类别；日期不变；Status 改 implemented；Proposal 改 Decision；把验收与风险整理为实际 Verification／Consequences，移除计划态标题和未完成承诺；同步所有受影响的相对链接。 |
| proposed → rejected | 移至 rejected，Status 加具体否决原因；保留当时方案和备选，不把正文改成相反决定；修复链接。 |
| 同一决定的路径、符号、参数变化 | 更新原篇事实；日志记录本次变化，不在决定正文堆流水账。 |
| 核心理由或路线翻转 | 新建决定并承接独特理由、备选和验证缺口；双方活跃时互链。部分取代保留两篇，不能归档仍有效的边界。 |
| 完全取代或完成使命 | 先判断后续是否仍需日常检索；接管笔记吸收独特内容，满足归档条件才走归档计划。 |

状态移动由 Agent 使用文件工具完成，不提供虚构的状态流转 HTTP API。移动前后检查重名、项目边界与链接，不覆盖同时出现的新文件。已封存笔记不再修改、移动或删除；错误更正写在活跃接管篇。清理活跃笔记须有当前任务授权并保留必要理由；不得借治理批量删规则。

完成写作、移动或更新后运行 notes verify。项目要求同次提交时随实现一起准备，但不擅自提交、推送或安装 CI。最后简短报告笔记路径、真实状态、校验结果和未决问题。
