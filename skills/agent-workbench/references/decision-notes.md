# 决策写作与状态流转

先用 maintenance 查询相关决定，read 命中文档；更新已有决定或新建笔记，只操作当前授权的已登记项目。

路径：`.agents/notes/{生命周期}/{类别}/YYYY-MM-DD-topic.md`。日期为首次提出日；类别使用 architecture、feature、bug-fix、simplification、process、testing。

| 生命周期 | 状态与模板 |
| --- | --- |
| proposed | `Status: proposed`，使用[方案稿](../assets/notes/proposed.md) |
| implemented | `Status: implemented`，使用[已落地](../assets/notes/implemented.md) |
| rejected | `Status: rejected — 原因`，使用[否决](../assets/notes/rejected.md) |
| archived | 由[归档工具](note-operations.md)生成冻结快照 |

头部为标题 `# Agent Note: 标题`、空行、Status、空行。模板中的章节用于看板解析与格式校验，正文写作要求遵循 AGENTS.md。

- proposed 落地：移到 implemented，保留日期，更新 Status，将 Proposal 改为 Decision，移除计划态标题并同步相对链接。
- proposed 否决：移到 rejected，状态注明原因，保留原方案并修复链接。
- 同一决定的事实变化：更新原篇；路线改变时另建决定并关联。实际迭代用 record 链接决定，不复制整篇正文。
- 仅需要保存历史快照时归档；封存文件的更正写入活跃文档。文件移动使用 Agent 文件工具，看板不提供决策编辑／状态切换按钮。

完成新增、修改或移动后运行：

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify
```

按错误修正目录、状态、章节或链接；关联迭代使用 record 的 decisionFiles。校验与归档命令细节见[校验与归档](note-operations.md)。
