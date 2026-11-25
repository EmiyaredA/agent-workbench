# 架构版本

架构用于解释实现，不会自动作为 AGENTS.md / RULES 注入。先读项目入口和源码，再整理图；生成和导入不执行被扫描项目的代码。

1. 用 `architecture --action list` 查看当前版本和待处理请求，按需 `--action read --version <ID>` 读取旧版本。
2. 从 [XML 模板](../assets/architecture/version.xml) 建立版本；有生成请求时填其 requestId。保持已有对象 ID，便于版本对比。
3. `architecture --action verify --input <版本.xml>` 校验，修复具体错误后再 `--action import --input <版本.xml>`。导入只增加候选；用户在看板核对并采用，旧版本保留。

命令沿用 Skill 的 `--project <项目ID或目录>` 和 `--data`。源码更新后生成新版本，不改历史快照；`--action status --version <ID>` 检查已引用文件是否变化。

## XML 字段

- architecture：title、description、requestId（可选）、rootGraphId、graphs / graph。
- graph：id、title、kind、direction、nodes / node、edges / edge。kind 可用 component、runtime、dependency、data、state、deployment、structure、flow；direction 为 DOWN 或 RIGHT。
- node：id、title、description、document、snippets / snippet；可补 files / file、childGraphId。documentFile 可引用项目内文档，导入时保存其快照。
- edge：与节点共用文档和片段字段，另含 from、to、evidence（static / traced / inferred）、annotations / annotation。annotation 也有 id、title、description、document 和 snippets。
- snippet：title（可选）、file、start、end。每段独立显示，使用项目根相对路径及 1 起始的闭区间行号，最多 200 行；每个对象至少关联一段。Markdown 放 CDATA。XML 不接受 DTD、自定义实体。

图上只放标题和简短描述；详细解释放 document。引用子图不会自动跳转，由用户点击进入。每个对象都关联真实源码；只有文档依据时明确标出，不能补造实现。静态依赖、源码追踪与推断使用对应 evidence，均不替代运行验证。

正式版本在项目 `.agent-workbench/architecture/`，包含 XML 输入、图示与代码快照、当前版本指针及生成请求。路径均相对项目，不绑定本机目录；临时扫描放项目允许的临时位置。CLI 无采用命令，采用由看板确认并自动留维护记录。

已有工坊报告可用 `architecture --action legacy --file docs/workshops-architecture.html` 转成候选版本。该适配器只读取已知内嵌数据，不运行 HTML；导入时重新核对源码，旧报告基线保留在描述中。
