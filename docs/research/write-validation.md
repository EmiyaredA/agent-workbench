# 模型输出与看板更新的校验边界

核对日期：2026-11-25。上游 `czm15053/write-notes-like-deepseek` 的 main 为 `72573a5b179de7798bbb7c4aeacdc0df6bf62439`。本次在线读取固定提交的说明、校验代码和 CI；没有运行或复制其 TypeScript 校验器，也未升级项目依赖。

## 上游怎样检查

| 证据 | 可机械检查的内容 |
| --- | --- |
| [校验说明](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/references/verification.md)与[目录检查](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts) | 生命周期、类别、文件名、目录层次、活跃文档的相对 Markdown 链接 |
| [格式检查](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts) | 标题与状态位置、状态和目录一致、必要章节、已实施笔记不残留方案阶段标题 |
| [归档检查](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts) | manifest 与磁盘哈希、冻结文件是否缺失、相对 Git 基线的封印只增不改 |
| [CI](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/.github/workflows/verify-notes.yml) | 校验失败退出非零；归档历史比较使用 PR 基线或 push 前提交，不以本次 HEAD 自比 |

上游把事实是否真实、动机是否成立、备选是否真实、收益与代价是否合理、验证结论是否有依据放在[语义自检指引](https://github.com/czm15053/write-notes-like-deepseek/blob/72573a5b179de7798bbb7c4aeacdc0df6bf62439/skills/write-notes-like-deepseek/references/quality-gate.md)，没有声称校验脚本可以证明这些结论。项目自己的测试仍需运行，格式通过不等于实现正确。

版本细节：该提交格式校验代码保留了早期笔记的 grandfather 标记兼容分支，而说明写得更严格；工作台未引入这项历史豁免。判断以实际代码和固定提交为准，不把文档描述当成已执行结果。

## 工作台原有的检查

- 约束目标固定，拒绝越界和符号链接；正文／扫描有大小上限。
- 写入核对读取版本；审核核对具体候选和原文 hash，外部修改停止写入。
- 维护记录要求必要字段与合法类别，显式关联须为已发现来源；重复 operationId 不重复留档。
- `notes --action verify` 检查决策目录、格式、链接及封印；归档计划和应用另有版本核对与恢复回执。
- `npm run check`、`npm test`、界面与离线分发验收检查工作台代码。它们不是对每份模型生成正文的语义证明。

## 本次补入实际运行流程

1. **日志写入前校验解析结果。** 标题须为不超过500字的单行文本；序列化后的记录、标识、类别、各字段和元数据须能被看板的解析器完整还原。伪造的保留标记、会破坏字段的 Markdown 结构拒绝写入。普通多行正文和代码示例继续支持。
2. **同时检查已有日志的追加状态。** 未闭合代码块或注释导致新记录无法独立解析时，保留原文并报错。直接修改、提案批准、整套保存在写正式约束之前预检对应日志；恢复写入也检查，避免先改约束再发现日志无法追加。
3. **关联决策自动校验。** 新记录实际引用的决策——包括 decisionFiles、relatedFiles、topic 与正文相对 Markdown 链接——校验格式及活跃链接。引用归档还核对磁盘与 manifest 封印。检查仅覆盖本次关联对象，不因无关的旧坏笔记阻塞所有记录；已完成请求重放保持幂等。
4. **直接改磁盘也能看到格式问题。** 维护查询为每篇决策返回 `validation: {scope:'format',ok,errors}`，把格式错误列入来源提示。无效笔记保留原文，可在清单、时间线和详情中阅读并标为“格式待修”，不进入架构基线与领域分类。此只读检查不执行 Git 历史封印验证，也不自动改写文件。

全量决策校验仍使用：

```sh
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action verify
```

需要对归档历史作版本比较时添加 `--base-ref <变更前提交>`。无 Git 时只能核对磁盘封印，不能证明历史未被修改。Skill CLI 失败退出非零，HTTP 无效写入返回400，版本冲突仍为409。

## 仍需人工或项目工具判断的内容

自然语言规则无法由通用 Markdown 检查器自动证明。例如“接口不能绕过业务层”“这个备选确实被讨论过”“测试全部通过”都需要对应代码检查、实际命令结果或人审。维护记录里的 verification 是提供者填写的说明，不是服务执行测试后的证明。

可由项目表达的约束应落实为测试、lint、类型或依赖边界检查；Skill 对其余部分核对当前约束、真实结果和验证缺口。约束差异继续遵守用户与项目的审核约定，不让模型填写一个合规布尔值就自动放行。
