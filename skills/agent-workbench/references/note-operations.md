# 决策笔记的校验与归档

使用已登记项目和与看板一致的 --data；决策操作不支持 global。

## 校验

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action verify --base-ref <变更前提交>
```

返回 `{ok,notes,errors,warnings}`，失败非零退出，不写文件。检查路径、日期、状态、必要章节、活跃 Markdown 链接及归档封印。无 Git 时只核对磁盘封印；有 Git 默认对照 HEAD，需要检查一次变更时指定变更前提交。未完成回执、扫描不完整或封印损坏须先处理，不自动重建坏封印。

## 归档

只归档已完成且不再承担当前职责的 implemented 笔记。需要另一篇接管时用 --successor 指定；没有接管篇则省略该参数。

```sh
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action archive --file <待归档路径> --successor <接管篇路径> > <计划JSON>
node <skill目录>/scripts/workbench.mjs notes --project <项目ID或目录> --action apply --input <已核对的计划JSON>
```

archive 只生成计划。按当前授权核对前后正文和 inbound 链接后 apply：工具冻结快照、更新 manifest 封印并移除活跃原件。计划过期时重新生成；中断时保留原计划重试，遇到外部编辑先核对差异，不覆盖新内容。

完成后修复计划列出的入站链接，重新 verify，按需 record 关联归档结果。已完成计划重放不改后续编辑。这里的 apply 仅执行归档，不批准约束。
