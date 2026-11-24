# 决策笔记的校验与归档

所有命令通过 `scripts/workbench.mjs` 使用已登记项目与同一 `--data`；支持项目 ID 或目录，不默认扩大到未登记仓库，不支持 global 决策笔记。

## 校验

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify
# 有 Git 时默认对照 HEAD，可明确指定历史提交：
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify --base-ref <提交>
```

校验不写文件，返回 `{ok,notes,errors,warnings}`，失败非零退出：

- 目录层次、六类主题、真实日期、Agent Note 头部与 Status 一致；不接受集中 INDEX.md。
- 活跃笔记的必需小节，implemented 不残留 Proposal／Plan／Acceptance criteria 等计划标题。代码块、引用和 HTML 注释里的示例标题不算正文小节。
- 活跃笔记的相对 Markdown 链接，包括指向日志或约束的链接；历史封存正文的出站旧链接免检。
- 归档头部、每篇文件的 SHA-256、清单中缺失或被改动的文件；有 Git 时对比指定基线，已有封印只能追加。
- 尚未完成的归档回执会报错，需用原计划显式恢复，不把中间状态当作通过。

无 Git 时只校验当前清单与磁盘一致，不能证明两者未同时被改写；基线尚无清单时也明确提示。新初始化但无提交的 Git 仓库需要先有可解析基线。扫描超过1000份 Markdown、10000个目录项或深度上限会失败，不把部分结果当通过。符号链接拒绝读取。局部 AGENTS.md／CLAUDE.md 不作为笔记格式检查，仍遵守其作用域。

脚本不验证论据是否真实、现在时含义或备选是否充分；这些按写作参考进行语义核对。不自动为现有坏格式、缺封印或哈希不符的归档“修复”哈希。历史笔记迁移需要单独展示具体差异并授权。

## 何时归档

只处理 implemented，proposed／rejected 不进归档区。仍在界定现行所有权、访问边界、否定保证或容易重犯的错误路线的决定应保留活跃，除非其全部独特理由已经由新决定接管；部分替代不能归档。归档判断依据是后续维护价值，不是年代、字数或引用次数。

有接管者时先完成接管正文并转 implemented，保留旧篇独特的理由、备选、代价和验证缺口。接管只形成工程事实，不批准任何新约束。无接管者的一次性已完成记录可以省略 `--successor`，但需说明归档理由。

## 生成计划、核对、执行

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action archive --file .agents/notes/implemented/architecture/YYYY-MM-DD-old.md --successor .agents/notes/implemented/architecture/YYYY-MM-DD-new.md > <临时计划.json>
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action apply --input <临时计划.json>
```

第一条命令只读，先确认退出成功再查看计划。计划包含完整前后文本、项目根、原路径、归档路径、归档日期和已登记文档的入站引用。按 changes 中 before／after 核对：旧篇只增加 Archived 一行，目标不覆盖，旧封印不变化，链接只追加到接管篇。它不是约束提案，不能用于批准约束；涉及已登记规则的目标会拒绝。

第二条在当前任务明确包含归档／治理时执行；只有写作授权时交用户审阅计划再执行。它会重新生成并核对精确计划，任何源文、接管篇、清单或入站引用变化都要求重新计划。

写入顺序：接管篇历史链接 → 归档副本（只插 Archived，保留其余字节）→ 清单封印 → 移除原路径。多文件不是一次原子事务；工作台数据目录的 `note-archives/` 保存意图与完成回执，共用跨进程写锁。操作中断后用**相同计划、相同数据目录**重试；每个文件须为预期前版或后版，有外部新编辑则停止并保留现场，不自动回滚或重写。完成后重复执行相同计划只返回完成回执，不重新改文件。

## 收尾不可省略

归档工具报告已登记文档的旧入站链接，不自动修复。另用 `rg --hidden -F '<旧文件名或旧相对路径>'` 在当前项目相关代码和文档中查漏，排除 `.git`、node_modules 和 archived。月度日志和代码注释也要检查；对有效约束的链接修复按本次授权通过 change 留档，或先提交提案。

把活跃引用指向接管篇或历史快照，绝不改归档正文的相对链接。约束中的链接修复根据授权用 change 留档，或提交 propose 等待讨论。再运行 notes verify；仍有断链、待审规则修复或缺失验证时如实报告，不能只凭 apply 成功称全流程完成。最后用 record 记录原因、实际结果、验证和后续，decisionFiles 引用真实归档或接管路径。工具不自动追加日志、不自动提交 Git，也不提供看板按钮。
