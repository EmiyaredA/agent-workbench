# 使用与维护指南

[← 项目首页](../README.md) · [界面截图](images/README.md) · [HTTP 接口](api.md)

个人多项目的 Agent 文档工作台：登记已有项目，统一查看项目约束，记录约束迭代，按需讨论修改提案，保留维护来由。正式内容留在项目 Markdown，换一个 code agent 仍能接着使用。

v0.1 使用 **mini-trellis-core 0.4.2 + 一个本机 Node 进程 + 原生浏览器页面**。没有数据库、专属模型服务或常驻观察 Agent；当前不接 CloudCLI。

## 启动

需要 Node.js 24+ 和 npm。Git 可用于管理项目版本，但看板也支持非 Git 目录。

```sh
npm ci --ignore-scripts
npm start
```

打开 [本地工作台](http://127.0.0.1:4173)。默认是真实空工作区，由你登记已有目录；登记只保存映射，不创建或改写项目文件。

完整交互的独立示例：

```sh
npm run demo -- --port 4174
```

打开 [演示工作台](http://127.0.0.1:4174)。示例与正式数据隔离；演示模式只接受演示目录。登记表单会给出一个已准备好的空示例目录。内置工作台、作品站和 API 服务三个不同项目，包含22份约束、11条待审／写入／拒绝／冲突提案、跨三个月的25条维护记录和27份决策笔记。示例版本保存在 `.runtime/demo-v4/`，旧演示目录原样保留。

可用 `--port`、`--data` 或 `AGENT_WORKBENCH_DATA` 指定端口和数据位置：

```sh
npm start -- --port 4180 --data /absolute/path/to/workbench-data
```

## 可以做什么

| 功能 | 当前行为 |
| --- | --- |
| 项目登记 | 检查目录、重复项；按固定目录读取约束、模块与维护日志 |
| 约束阅读 | 项目入口与补充约束按实际目录树展示，可展开／折叠；全局偏好独立进入，支持预览／Markdown 切换 |
| 变更记录 | 直接修改并保留前后版本、来由与来源；时间线／清单共用记录，支持搜索和同页抽屉；也支持待审提案 |
| 维护路径 | 修改或审核写入后留日志；可手动记录背景、实际结果、验证、后续和取舍 |
| 工程决策 | 四视图共用 `.agents/notes`；Skill 指导写作与状态流转，CLI 校验格式、链接和封印，并按精确计划归档；看板只读展示 |
| 查找与交接 | 搜索当前项目的文档与提案；Skill／CLI 按需读取规则和维护背景 |

用户授权直接修改时，可通过“修改并记录”或 CLI change 更新已登记约束，不必每次先走提案。每次保存旧版、新版、理由和来源，同步写维护日志，原文变化则停止；已完成请求重试不会覆盖之后的编辑。需要讨论或按项目约定人审时仍可创建提案，批准绑定原文和候选的具体版本。只读 HTTP 与 CLI 查询不会顺带执行恢复写入。工程决策笔记保存事实与取舍，状态变化不自动修改约束。

约束提案的“已写入”和工程笔记的“已落地”是两种状态。历史记录、被否决的方案和待审候选不会自动成为有效指令。Markdown 中的原始 HTML 以文本呈现，图片显示为链接，不自动加载外部资源。

维护记录默认打开架构基线。四个标签是同一批决策笔记的不同视图：基线突出当前决定与主题，时间线按笔记日期排列，避坑提取这些笔记中的备选／否决理由，清单列出全部决策。月份、类别、状态与关键词共用，切换视图保留筛选。实际迭代从“迭代日志”入口或决策关联进入，不混入决策时间线。方案稿、否决和历史状态分别标注。记录迭代可选择类别、关联已有决策与文件；重试复用同一操作标识，不重复追加。详情中的决策、文档与迭代链接在同一个抽屉切换，支持浏览器前后退和预览／Markdown 切换。决策正文与状态仍由 Agent 维护，看板不提供决策编辑或归档操作。

项目内只保留约束、变更记录和维护记录；全局也使用相同流程。变更记录默认按月排列，清单、搜索、状态筛选与当前页抽屉共用同一批记录。约束页按文件关联迭代，不拆散或复制正式 Markdown。新迭代、提案和手工维护日志必须选择六类标签之一；旧记录没有标签时显示“未标注”，不自动补造。项目从左侧切换。月份筛选与窄屏项目切换使用统一自定义菜单，支持键盘选择。

## 文件与状态

- 项目固定来源：根 `AGENTS.md`、`.agent-workbench/rules/` 与 `docs/maintenance/`；模块先读 `index.md`。登记只需名称和已有目录。完整规则见 [目录约定](directory-convention.md)。
- 维护日志固定读取和追加到 `docs/maintenance/`；不自动扫描 `.trellis` 或其他旧目录。
- 索引引用的既有 README、契约或背景资料可在项目目录设置的 `referenceFiles` 中逐文件登记；只读打开，不加入有效约束或自动上下文。
- 全局偏好登记一个已有 Markdown 文件，不自动修改任何 Agent 配置。
- 演示 v4 为三项目补充具体取舍、明确的主题关联和验收场景，保留旧 demo／demo-v2／demo-v3 目录和其中的用户编辑，不迁移真实项目。
- 本机状态默认在 `.runtime/workbench/`，演示在 `.runtime/demo-v4/`；来源映射、候选、回执与锁均不提交 Git。
- 工作台仅绑定 `127.0.0.1`。直接修改与提案审核都是应用流程，不是对同一用户下其他文件工具的系统级隔离。

普通改动不强制产出新规则。随着模型能力增强，应当合并、收窄或删除不再需要的提示；根据项目约定与本次用户授权选择直接留档或先提案。

## Code Agent Skill

仓库内 [Skill](../skills/agent-workbench/SKILL.md) 不需要先全局安装即可使用：

```sh
node skills/agent-workbench/scripts/workbench.mjs projects
node skills/agent-workbench/scripts/workbench.mjs context --project /absolute/path/to/project
node skills/agent-workbench/scripts/workbench.mjs read --project PROJECT_ID --file .agent-workbench/rules/frontend.md
node skills/agent-workbench/scripts/workbench.mjs journal --project PROJECT_ID --query 关键词
```

`context` 返回全局／项目正文、模块根索引正文和模块文件列表；模块正文按需 `read`。普通 README、其他 docs 与研究笔记不在常规扫描范围。加载 Skill 的 code agent 根据当前对话提出候选，工作台不后台采集聊天，也不运行额外推理模型。复制安装 Skill 时，用 `AGENT_WORKBENCH_ROOT` 指向本仓库，数据目录与看板保持一致。

CLI 支持 `projects / context / read / journal / maintenance / propose / change / record / notes`，没有提案批准命令。`change --project <ID或global> --input <JSON>` 用于获授权的直接修改：输入包含 file、title、reason、source、content、必填标签 category、read 返回的 baseHash 和稳定 operationId；返回 recorded 后可在“变更记录”查看真实前后差异。提案输入与维护记录格式见 Skill；HTTP 接口见 [接口说明](api.md)。

决策写作、proposed／implemented／rejected 流转与三种模板见 [Skill 决策参考](../skills/agent-workbench/references/decision-notes.md)。笔记在获授权的项目中由 Agent 维护；涉及约束时按用户授权记录迭代或提交提案。校验与归档命令：

```sh
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action verify
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action archive --file .agents/notes/implemented/architecture/YYYY-MM-DD-old.md --successor .agents/notes/implemented/architecture/YYYY-MM-DD-new.md > /tmp/note-archive-plan.json
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action apply --input /tmp/note-archive-plan.json
```

`archive` 只读生成完整前后文本计划；核对后 `apply` 才写入归档副本、SHA-256 清单和接管篇链接，最后移除原路径。中断后以相同计划与数据目录重试，遇到外部新编辑停止；不改写封存正文或覆盖旧封印。旧入站链接需另行修复后再次校验，日志与规则的链接也会核对。无 Git 时只能校验当前哈希，不能证明历史只增不改。具体范围与历史缺封印的处理见 [校验与归档](../skills/agent-workbench/references/note-operations.md)。工具随工作台分发，不依赖上游项目路径或新增运行包。

## 验证与构建

```sh
npm run check
npm test
npm run build
npm run test:ui
```

`npm test` 必须找到并执行实际测试。`test:ui` 使用独立临时目录与全新浏览器配置，不读真实会话或项目数据。macOS 默认可使用已安装的 Chrome；也可设置 `AWB_CHROME`，或运行 `npx playwright install chromium` 使用测试浏览器。Playwright 仅为开发依赖。

`build` 输出 `dist/`，包含运行源码、静态页面、Skill 与许可；没有前端编译链。在分发目录运行 `npm ci --omit=dev --ignore-scripts` 后即可 `npm start`。开发验收命令在源码仓库运行。

当前本机验收：63 项 Node／HTTP／CLI 测试、38 项浏览器检查通过。浏览器覆盖 17 张设计稿的主要操作和状态及 Skill 参考／模板阅读；截图、对照图与机器报告保存在忽略的 `.local/ui-acceptance/`。四视图专项另有14张截图和报告，位于 `.local/maintenance-ui/`。CI 配置运行检查、测试、构建及两组浏览器验收，上传隔离示例的验收截图。

## 设计依据与边界

- [整体设计](design.md)、[源码审查](research/source-review.md)、[mini-trellis 取用边界](research/mini-trellis.md)
- [17 张独立交互图](ui/interaction-previews/README.md)、[视觉验收](../design-qa.md)、[维护记录](maintenance/2026-11.md)

外部工具直接编辑约束时，当前还没有最后已审快照或自动送审；`context` 读取磁盘现状。已有候选仍会在批准前核对版本并阻止覆盖外部新编辑。

看板未提供工程笔记编辑／归档按钮；Skill／CLI 已提供决策流程与归档写入。未实现原始聊天历史导入、跨设备同步或后台自动提炼。提炼质量取决于加载 Skill 的宿主 Agent，尚未进行真实对话准确率评估。文件查看按单文件 1 MB 与扫描上限工作，结果不完整时给出提示。

使用 AGPL-3.0，保留上游依赖的许可与归属，见 [LICENSE](../LICENSE) 和 [NOTICE](../NOTICE)。
