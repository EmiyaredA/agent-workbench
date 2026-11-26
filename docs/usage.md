# 使用与维护指南

[← 项目首页](../README.md) · [界面截图](images/README.md) · [HTTP 接口](api.md)

个人多项目的 Agent 文档工作台：登记已有项目，统一查看项目约束，记录约束迭代，按需讨论修改提案，保留维护来由。正式内容留在项目 Markdown，换一个 code agent 仍能接着使用。

v0.1 使用 **mini-trellis-core 0.4.2 + 一个本机 Node 进程 + 原生浏览器页面**。没有数据库、专属模型服务或常驻观察 Agent；当前不接 CloudCLI。

## 启动

需要 Node.js 24+ 和 npm。Git 可用于管理项目版本，但看板也支持非 Git 目录。

```sh
npm start
```

源码首次启动会按 `package-lock.json` 自动安装运行依赖，需要联网，不执行安装脚本，不安装 Playwright。依赖齐备后不会再次安装，可离线启动。也可直接使用 `node start.mjs`；首次准备仍需 npm。安装失败时会给出提示，修复网络后重新运行即可。

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
| 项目约束 | 按文件阅读正文，目录展示文件结构；整体编辑支持新增／重命名／移除文件、当前文件预览、原地审核保存与整套模板复用。全局偏好保留独立入口 |
| 变更记录 | 展示 Agent／CLI 留档的前后版本、来由与来源；时间线／清单共用记录，支持搜索、同页详情与待审提案审核 |
| 维护路径 | 阅读 Agent／CLI 维护的背景、实际结果、验证、后续和取舍；修改或审核写入后自动留档 |
| 工程决策 | 四视图共用 `.agents/notes`；Skill 指导写作与状态流转，CLI 校验格式、链接和封印，并按精确计划归档；看板只读展示 |
| 查找与交接 | 搜索当前项目的文档与提案；Skill／CLI 按需读取规则和维护背景 |

看板提供整套项目约束编辑、阅读、追溯与已有提案审核；单文件提案创建／正文修改和独立日志新增仍由 Agent／CLI 完成。用户授权直接修改时，可通过 CLI change 更新已登记约束，不必每次先走提案。每次保存旧版、新版、理由和来源，同步写维护日志，原文变化则停止；已完成请求重试不会覆盖之后的编辑。需要讨论或按项目约定人审时仍可创建提案，批准绑定原文和候选的具体版本。只读 HTTP 与 CLI 查询不会顺带执行恢复写入。工程决策笔记保存事实与取舍，状态变化不自动修改约束。

约束提案的“已写入”和工程笔记的“已落地”是两种状态。历史记录、被否决的方案和待审候选不会自动成为有效指令。Markdown 中的原始 HTML 以文本呈现，图片显示为链接，不自动加载外部资源。

维护记录默认打开架构基线。四个标签是同一批决策笔记的不同视图：基线突出当前决定与主题，时间线按笔记日期排列，避坑提取这些笔记中的备选／否决理由，清单列出全部决策。月份、类别、状态与关键词共用，切换视图保留筛选。实际迭代从“迭代日志”入口或决策关联进入，不混入决策时间线。方案稿、否决和历史状态分别标注。Agent／CLI 记录迭代时可指定类别、关联已有决策与文件；重试复用同一操作标识，不重复追加。详情中的决策、文档与迭代链接在同一个抽屉切换，支持浏览器前后退和预览／Markdown 切换。决策正文与状态仍由 Agent 维护，看板不提供决策编辑或归档操作。

项目内只保留约束、变更记录和维护记录；全局也使用相同流程。变更记录默认展示变更清单，可切换到按月排列的迭代时间线，以连续纵轴和节点连接记录，桌面日期位于轴线左侧，手机日期移到记录上方；两种视图、搜索、状态筛选与当前页抽屉共用同一批记录。约束页按文件关联迭代，不拆散或复制正式 Markdown。新迭代、提案和手工维护日志必须选择六类标签之一；旧记录没有标签时显示“未标注”，不自动补造。项目从左侧切换。月份筛选与窄屏项目切换使用统一自定义菜单，支持键盘选择。

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

CLI 支持 `projects / context / read / journal / maintenance / propose / change / record / notes`，没有提案批准命令。`change --project <ID或global> --input <XML>` 用于获授权的直接修改：输入包含 file、title、reason、source、content、必填标签 category、read 返回的 baseHash 和稳定 operationId；返回 recorded 后可在“变更记录”查看真实前后差异。提案输入与维护记录格式见 Skill；HTTP 接口见 [接口说明](api.md)。

人工填写的 change／propose／record 输入采用 XML，根标签与命令同名；正文用 CDATA，关联路径用重复的 file 子标签，具体模板可从 Skill 接入页打开。已有 JSON 输入继续兼容；CLI 返回值及工具生成的归档计划保持 JSON。

全局偏好只提供“全局约束”和“变更记录”，不提供维护看板或独立维护记录写入；maintenance／record 仅用于项目。全局约束变更继续保留前后版本、理由和留档，已有历史不删除。

决策写作、proposed／implemented／rejected 流转与三种模板见 [Skill 决策参考](../skills/agent-workbench/references/decision-notes.md)。笔记在获授权的项目中由 Agent 维护；涉及约束时按用户授权记录迭代或提交提案。校验与归档命令：

```sh
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action verify
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action archive --file .agents/notes/implemented/architecture/YYYY-MM-DD-old.md --successor .agents/notes/implemented/architecture/YYYY-MM-DD-new.md > /tmp/note-archive-plan.json
node skills/agent-workbench/scripts/workbench.mjs notes --project PROJECT_ID --action apply --input /tmp/note-archive-plan.json
```

`archive` 只读生成完整前后文本计划；核对后 `apply` 才写入归档副本、SHA-256 清单和接管篇链接，最后移除原路径。中断后以相同计划与数据目录重试，遇到外部新编辑停止；不改写封存正文或覆盖旧封印。旧入站链接需另行修复后再次校验，日志与规则的链接也会核对。无 Git 时只能校验当前哈希，不能证明历史只增不改。具体范围与历史缺封印的处理见 [校验与归档](../skills/agent-workbench/references/note-operations.md)。工具随工作台分发，不依赖上游项目路径或新增运行包。

## 项目架构

打开项目顶部“架构”：左侧搜索源码，中间选择节点／连线／说明，右侧阅读文档和代码。每个代码片段是独立 block；“定位源码”打开当前文件，并提示它与版本快照是否一致。选择节点不会自动进入子图，使用“进入子图”与“返回上一级”导航。

“生成新版本”创建交给现有 Agent 的任务；不会在看板后台调用模型。Agent 按 [Skill 架构参考](../skills/agent-workbench/references/architecture.md)生成 XML，在工作台目录执行：

```sh
node src/cli.mjs architecture --project PROJECT_ID --action list
node src/cli.mjs architecture --project PROJECT_ID --action verify --input version.xml
node src/cli.mjs architecture --project PROJECT_ID --action import --input version.xml
```

也可在看板选择 XML 文件导入。候选版本不替换当前版本；核对内容或对比版本后“采用此版本”，自动留维护记录。导出菜单提供当前图 SVG 和含全部文档／片段的离线 HTML。源码更新提示只检查该版本已引用文件；扫描、引用校验均不证明业务运行正确。

版本、XML 输入、代码快照和当前指针保存在项目 `.agent-workbench/architecture/`，随项目移动；不会自动注入约束。旧工坊架构报告适配与字段限制见 Skill 参考。没有架构数据的项目保持空状态，全局偏好不提供此功能。

## 验证与构建

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run test:package
npm run test:ui
```

`npm test` 必须找到并执行实际测试。`test:ui` 使用独立临时目录与全新浏览器配置，不读真实会话或项目数据。macOS 默认可使用已安装的 Chrome；也可设置 `AWB_CHROME`，或运行 `npx playwright install chromium` 使用测试浏览器。Playwright 仅为开发依赖。

`build` 输出 `dist/` 和 `dist/agent-workbench-0.1.0.tgz`，包含锁定版本的运行依赖、源码、静态页面、Skill 与许可，不包含开发依赖或本机数据；没有前端编译链。将压缩包复制到另一台装有 Node.js 24+ 的电脑，解压后进入 `package/` 执行 `node start.mjs`，无需安装依赖、无需 npm、无需联网。演示使用 `node start.mjs --demo --port 4174`，参数和数据目录约定与源码相同。归档文件仅由本地构建生成，目前未发布下载版本。

`test:package` 从压缩包在独立临时目录启动服务，禁用 npm 入口并核对静态资源、项目登记、提案差异和 CLI／Skill 查询。开发验收命令在源码仓库运行；先执行 `npm ci --ignore-scripts` 安装包含 Playwright 的完整依赖。

Node／HTTP／CLI／启动及离线包验收见此前记录；本轮内容编辑入口收敛通过38项浏览器检查，包含 Agent 留档读取、已有提案审核和界面无手工编辑表单。浏览器覆盖 17 张设计稿的主要操作和状态及 Skill 参考／模板阅读；截图、对照图与机器报告保存在忽略的 `.local/ui-acceptance/`。四视图专项另有14张截图和报告，位于 `.local/maintenance-ui/`。CI 配置运行检查、测试、构建、离线包验收及两组浏览器验收，上传隔离示例的验收截图。

## 设计依据与边界

- [整体设计](design.md)、[源码审查](research/source-review.md)、[mini-trellis 取用边界](research/mini-trellis.md)
- [17 张独立交互图](ui/interaction-previews/README.md)、[视觉验收](../design-qa.md)、[维护记录](maintenance/2026-11.md)

外部工具直接编辑约束时，当前还没有最后已审快照或自动送审；`context` 读取磁盘现状。已有候选仍会在批准前核对版本并阻止覆盖外部新编辑。

看板未提供工程笔记编辑／归档按钮；Skill／CLI 已提供决策流程与归档写入。未实现原始聊天历史导入、跨设备同步或后台自动提炼。提炼质量取决于加载 Skill 的宿主 Agent，尚未进行真实对话准确率评估。文件查看按单文件 1 MB 与扫描上限工作，结果不完整时给出提示。

使用 AGPL-3.0，保留上游依赖的许可与归属，见 [LICENSE](../LICENSE) 和 [NOTICE](../NOTICE)。

## 整套项目约束与模板

约束页统一按文件阅读。点击“整体编辑”后，使用“模板配置”和“目录与内容”两个 Tab；两者共用草稿，切换不丢失正文、选中文件及滚动位置。已有项目默认进入目录与内容，空项目从模板配置开始。

目录与内容包含文件树、Markdown 编辑及当前文件预览。文件的 `···` 或右键菜单提供重命名、移动、移除和复制路径；新增、改名、移动时才出现临时表单。位置从目录列表选择，也可新建子目录，无需手写完整路径。`AGENTS.md` 与根 `index.md` 路径固定。移动与改名会修复草稿集合中可确定的相对 Markdown 链接；代码块、外部链接保持原样，无法确定的引用给出核对提示。所有文件操作均先留在草稿。

“查看整套差异”在当前弹窗内打开临时审阅层；返回编辑恢复原 Tab 和文件。核对新增、更新与移除的每份内容，再确认保存。继续修改正文会使已查看差异失效；任何项目约束被外部新增或修改时，旧草稿停止写入并保留。保存记录所有参与文件的前后版本，追加一条事实日志；逐文件持久化发生中断时核对版本再恢复，不承诺跨文件的文件系统原子事务。

顶部先选择“默认模板”或个人模板。“默认模板”按前端、后端、数据和文件存储分组配置，通用约束自动包含。支持 TypeScript 的 Vue 3／React、Go/go-zero 或 Python/FastAPI、PostgreSQL／SQLite、Redis／不使用、本地文件／对象存储 OSS；也可选择不适用。框架随语言联动，数据访问方式由后端语言确定；每个有效组合都有实际 Markdown 规则。选择技术不安装依赖、不转换业务代码，也不证明项目已经具备选定技术。已登记工坊和参考脚手架的内容依据见[模板适配说明](research/template-adaptation.md)。

读取已知项目清单与入口时会提供可确认的配置初值及来源，无法判断时显示提示；存储方式不根据数据库或 SDK 缺失猜测，请人工确认。选择模板或切换配置只修改草稿。没有改过的模板文件随配置更新；项目自有文件保留，同名或已编辑内容提供原文／模板对比及“保留原文”“采用模板”“编辑合并”。未处理冲突不能保存或另存模板，继续编辑仍须重新查看精确差异。

点击“保存为我的模板”后，在临时表单中填写名称，保存完整草稿快照到工作台本机 `templates/`；之后可在其他项目复用，实例与模板独立。旧个人模板照常读取，不强制增加参数。模板不保存项目绝对路径、来源映射、维护历史或文件版本。

登记项目本身只读，不自动创建文件。整套编辑保留入口与索引，最多 100 份文件、合计 500 KB 正文。保存时为尚未列出的模块补充文件链接，已有索引正文保留。

文件与目录不另设注释字段。旧模板中的用途元数据不再加载；旧索引中由工作台生成的 `awb:structure` 区段在整套编辑时移除，具体清理差异随保存一起确认。手工编写的正文与索引表格保留。


项目模板与维护 Skill 各有范围：默认模板的参数与模块关系位于 `templates/default/template.xml`，正文来自同目录 `rules/*.md`；输出项目入口、按任务索引、工程约定、开发与实测流程、playbook，以及 `技术栈/前端.md`、`后端.md`、`数据与存储.md` 中适用的模块。架构与系统设计在配置 Tab 中提供只读写作参考，不自动创建空的有效约束。已有相关文档继续保留。旧 `templates/project/` 保留历史文件，不再作为内置模板入口。新增技术选项必须补齐对应正文、依赖和组合测试，不列出尚无规则的选项。模板只生成项目约束，不包含维护历史或 Skill 文件。

维护记录的写法与更新流程见 Skill 的[维护记录指引](../skills/agent-workbench/references/maintenance-records.md)，可从「Skill 接入」打开和复制[输入模板](../skills/agent-workbench/assets/maintenance/record.xml)。实际日志保留在项目 `docs/maintenance/YYYY-MM.md`，决定保留在 `.agents/notes/`。约束经 change、提案批准或整体编辑保存已自动留档，同一变化不再重复 record；其他重要代码／文档工作按 Skill 记录事实，不自动升级为约束。


维护记录写入前会检查标题、字段与标识能否完整解析，关联决策会自动核对格式、活跃链接或归档封印；错误返回后保留原文。旧日志存在未闭合代码块／注释，导致新条目无法独立解析时也会停止写入。约束修改在写正式文件之前预检日志。

外部直接写入的格式错误笔记仍可查看，在维护页标记“格式待修”，不会进入架构基线。`notes --action verify` 可作独立校验；指定变更前的 `--base-ref` 才能比较归档封印历史。结构校验与真实行为验证分开，范围和上游证据见[校验边界](research/write-validation.md)。

## 验收与维护记录

项目「验收」按需求阅读标准、实际结果、证据与审核结论。点击验证历史可追溯失败与复测，点击相关决定进入维护详情；决定详情可返回关联需求。浏览器前进后退保留选择与阅读位置。

维护记录提供架构基线、演进时间线、避坑智库、决策清单四个视图，共用筛选条件与排序。演进时间线按笔记日期分月展示，引用排序在各月内生效；决策清单提供紧凑表格，两者打开同一决策详情。时间线地址可直接打开与刷新。历史日志保存在原目录，通过关联来源继续阅读。

需求由 Agent／CLI 使用 XML 维护，具体操作见[验收流程](../skills/agent-workbench/references/acceptance.md)。源码或标准变化时旧结果显示待复核，缺少证据和版本依据会提示。审核结论与测试结果分别展示。
