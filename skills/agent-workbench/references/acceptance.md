# 需求验收

从[需求输入](../assets/acceptance/requirement.xml)和[验证轮次输入](../assets/acceptance/run.xml)开始。XML 路径均相对项目根目录。

```sh
node <skill目录>/scripts/workbench.mjs acceptance --project <项目> --action list
node <skill目录>/scripts/workbench.mjs acceptance --project <项目> --action read --id <需求ID>
node <skill目录>/scripts/workbench.mjs acceptance --project <项目> --action verify --input <需求.xml>
node <skill目录>/scripts/workbench.mjs acceptance --project <项目> --action write --input <需求.xml>
node <skill目录>/scripts/workbench.mjs acceptance --project <项目> --action append --input <验证.xml>
```

- 一项需求一份 Markdown，位于 `docs/需求/进行中/` 或 `docs/需求/已完成/`。读写复用同一稳定 id；移动文件时保留 id。
- `write` 更新完整需求元数据及标准，`append` 追加验证。先读取 hash，填入 baseHash；新文件留空。operationId 用于相同输入重试。
- 正文的 `awb-acceptance:start/end` 管理区由工具维护，其他正文保留。旧文档可以阅读，首次 write 在末尾加入管理区。历史轮次不能修改，追加新轮次说明修正。
- status 为 pending、active、completed。每项标准有稳定 id 和 text。更新 text 或 version 后，旧结果显示待复核。
- 验证 result 填 criterionId、当轮 standard 原文、status。结果为 passed、failed、untested、blocked、na；blocked/na 填 reason。at 使用带时区 ISO 时间。证据放 evidenceList/evidence 中的 title 和 file。
- Git 项目会捕获当前代码文件内容摘要；非 Git 项目可在 run/sources/source 中提供 file，工具记录 hash。使用实际被测工作区运行命令，随后追加验证。未提供源码快照的记录会提示依据不足。
- 代码审核用 review/status、version、reviewer、summary；通过为 passed，未通过 failed，待审 pending。delivery 保存交付与后续事实，合并情况写明实际状态。
- 原型用 prototypeFile 填文件路径。关联决定用 decisions/decision/file 指向 `.agents/notes/`；看板自动计算反向关联。仅有普通正文链接时也可识别。
- `completed` 要求全部标准在当前版本通过或有理由不适用，并有当前版本的通过审核。记录按实际结果填写，缺证据会提示。
- 生成区本身保存在需求 Markdown 内。需要导出时，复制其 acceptance XML，补 file、baseHash、operationId，移除 operations 后 write。CLI 输出也包含完整 model。

Git 自动快照覆盖 1000 个以内的受支持代码／配置文件，超过范围时使用显式 sources 并提示缺口。证据在记录时保存内容 hash，文件后续变化或缺失会提示核对原轮次依据。
