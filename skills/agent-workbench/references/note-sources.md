# 决策流程的来源与取舍

参考本机 write-notes-like-deepseek，固定提交 `8f3b404cf9fd8102f96561f390219877abf094a8`。本次未更新上游。依据：SKILL.md、references/note-format.md、archiving.md、quality-gate.md，以及目录、格式、归档和封印校验脚本。

吸收其可互操作的路径、状态、章节、归档 manifest v1 格式，以及“原地更新事实、决定翻转另开、归档冻结”的方法。详细原始研究见工作台仓库 docs/research/maintenance-integration.md。

这里独立实现 Node 工具与精简模板，没有复制上游产品源码或资源，没有新增 tsx 或上游运行依赖。上游 README 标注 MIT，但该固定检出未包含 LICENSE 文件，因此没有把它视为已具备完整许可材料的可分发代码包。若以后直接引入其代码或模板，应先核对并保留具体版权与许可。

保留工作台特有的边界：约束每次精确差异审核，决策状态与约束批准独立；既有授权无需每步再确认；日志与决策各存一份正文；归档计划核对与中断回执；不自动封印未知历史、提交 Git、安装 CI 或运行上游看板。
