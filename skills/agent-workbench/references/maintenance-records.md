# 维护记录写作与更新

把[维护记录输入模板](../assets/maintenance/record.xml)复制为临时 XML，填好后运行：

```sh
node <skill目录>/scripts/workbench.mjs record --project <项目ID或目录> --input <记录XML文件>
```

根标签为 `<record>`，字段名就是标签名。多行正文放进 `<![CDATA[正文]]>`；正文如含 `]]>`，拆成 `]]]]><![CDATA[>`。普通文本中的 `&`、`<` 分别写为 `&amp;`、`&lt;`。

关联路径写为 `<relatedFiles><file>AGENTS.md</file></relatedFiles>`，多项重复 file，decisionFiles 同理；空列表保留空标签。只使用表中字段，不使用属性或 DTD。

| 字段 | 用途 |
| --- | --- |
| title、background、result | 必填：标题、修改原因、实际结果；标题为不超过500字的单行文本 |
| category | 必填：architecture、feature、bug-fix、simplification、process、testing 之一 |
| verification、next | 实际检查结果、后续事项，可留空 |
| alternatives、tradeoffs、topic | 可选：备选、取舍和相关主题 |
| decisionFiles、relatedFiles | 已发现的决策／已登记 Markdown 相对路径数组，没有则留空 |
| operationId | 本次记录的唯一标识，建议 UUID；原样重试保持不变，新迭代换新标识 |

源码位置可写在 result 中，不放进仅接受已登记 Markdown 的 relatedFiles。日志按当前上海时区月份追加到 `docs/maintenance/YYYY-MM.md`，无需指定目标文件；返回 file、key、replayed。

约束通过 change、提案批准或整体编辑保存已自动留档，不再为同一修改重复 record。工程决定的状态更新另见[决策写作与流转](decision-notes.md)；记录日志不会批准约束或采纳决定。

核对结果用 `journal --query <标题关键词>`，关联决定用 `maintenance`。同一输入 和 operationId 重试只记一条，不同内容沿用已完成标识会被拒绝。历史更正追加说明，不覆盖整个月份文件。

写入会检查字段解析、关联决策及日志追加结构。遇到错误按返回信息修正；文件已变化时重新读取。格式通过不代表项目测试已经执行。外部工具修改决策后运行 `notes --action verify`；格式错误在看板标为“格式待修”。
