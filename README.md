# agent-workbench

个人多项目的 Agent 文档工作台：登记已有项目，统一查看项目约束，审核修改提案，保留维护来由。正式内容留在项目 Markdown，换一个 code agent 仍能接着使用。

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

打开 [演示工作台](http://127.0.0.1:4174)。示例与正式数据隔离；演示模式只接受演示目录。登记表单会给出一个已准备好的空示例目录。内置工作台、作品站和 API 服务三个不同项目，包含22份约束、11条待审／写入／拒绝／冲突提案、跨三个月的维护记录和13份决策笔记。示例版本保存在 `.runtime/demo-v3/`，旧演示目录原样保留。

可用 `--port`、`--data` 或 `AGENT_WORKBENCH_DATA` 指定端口和数据位置：

```sh
npm start -- --port 4180 --data /absolute/path/to/workbench-data
```

## 可以做什么

| 功能 | 当前行为 |
| --- | --- |
| 项目登记 | 检查目录、重复项；设置已有约束、模块与维护文档来源 |
| 约束阅读 | 项目入口与补充约束按实际目录树展示，可展开／折叠；全局偏好独立进入，支持阅读／原文切换 |
| 提案审核 | 新建、编辑、并排 diff、批准、拒绝；原文变化则停止写入并重新提案 |
| 维护路径 | 审核后留日志；可手动记录背景、实际结果、验证、后续和取舍 |
| 工程决策 | 架构基线、演进时间线、避坑智库、决策清单共用 `.agents/notes`；侧栏展开原文、备选与关联迭代 |
| 查找与交接 | 搜索当前项目的文档与提案；Skill／CLI 按需读取规则和维护背景 |

新建文件也要通过提案。批准绑定原文和候选的具体版本；重复批准不会重复追加维护记录。中断恢复核对当前文件，保留之后的外部编辑。只读 HTTP 与 CLI 查询不会顺带执行恢复写入。

约束提案的“已写入”和工程笔记的“已落地”是两种状态。历史记录、被否决的方案和待审候选不会自动成为有效指令。Markdown 中的原始 HTML 以文本呈现，图片显示为链接，不自动加载外部资源。

维护记录默认打开架构基线；时间线区分实际迭代与决策首次提出，避坑智库同时展示否决方案和真实备选。记录迭代可选择类别、关联已有决策与文件；重试复用同一操作标识，不重复追加。决策正文与状态仍由 Agent 维护，看板不提供决策编辑或归档操作。

项目内只保留约束、提案和维护记录；项目从左侧切换。月份筛选与窄屏项目切换使用统一自定义菜单，支持键盘选择。

## 文件与状态

- 项目默认来源：根 `AGENTS.md`、`.agent-workbench/rules/` 与 `docs/maintenance/`；模块先读 `index.md`。新项目只需登记目录，旧布局在兼容设置中保留。完整规则见 [目录约定](docs/directory-convention.md)。
- 保留现有目录；同时可读取 `.trellis/workspace/` 的既有日志。新记录追加到配置的维护目录，不修改上游 journal 索引。
- 全局偏好登记一个已有 Markdown 文件，不自动修改任何 Agent 配置。
- 演示 v3 补充六类决定、替代关系与明确关联，保留旧 demo／demo-v2 目录和其中的用户编辑，不迁移真实项目。
- 本机状态默认在 `.runtime/workbench/`，演示在 `.runtime/demo-v3/`；来源映射、候选、回执与锁均不提交 Git。
- 工作台仅绑定 `127.0.0.1`。人审是应用流程保证，不是对同一用户下其他文件工具的系统级隔离。

普通改动不强制产出新规则。随着模型能力增强，应当合并、收窄或删除不再需要的提示；这些规则变更仍经审核。

## Code Agent Skill

仓库内 [Skill](skills/agent-workbench/SKILL.md) 不需要先全局安装即可使用：

```sh
node skills/agent-workbench/scripts/workbench.mjs projects
node skills/agent-workbench/scripts/workbench.mjs context --project /absolute/path/to/project
node skills/agent-workbench/scripts/workbench.mjs read --project PROJECT_ID --file .agent-workbench/rules/frontend.md
node skills/agent-workbench/scripts/workbench.mjs journal --project PROJECT_ID --query 关键词
```

`context` 返回全局／项目正文、模块根索引正文和模块文件列表；模块正文按需 `read`。普通 README、其他 docs 与研究笔记不在常规扫描范围。加载 Skill 的 code agent 根据当前对话提出候选，工作台不后台采集聊天，也不运行额外推理模型。复制安装 Skill 时，用 `AGENT_WORKBENCH_ROOT` 指向本仓库，数据目录与看板保持一致。

CLI 支持 `projects / context / read / journal / maintenance / propose / record`，没有批准命令。提案输入与维护记录格式见 Skill；HTTP 接口见 [接口说明](docs/api.md)。

## 验证与构建

```sh
npm run check
npm test
npm run build
npm run test:ui
```

`npm test` 必须找到并执行实际测试。`test:ui` 使用独立临时目录与全新浏览器配置，不读真实会话或项目数据。macOS 默认可使用已安装的 Chrome；也可设置 `AWB_CHROME`，或运行 `npx playwright install chromium` 使用测试浏览器。Playwright 仅为开发依赖。

`build` 输出 `dist/`，包含运行源码、静态页面、Skill 与许可；没有前端编译链。在分发目录运行 `npm ci --omit=dev --ignore-scripts` 后即可 `npm start`。开发验收命令在源码仓库运行。

当前本机验收：43 项 Node／HTTP／CLI 测试、32 项浏览器检查通过。浏览器覆盖 17 张设计稿的主要操作和状态；截图、对照图与机器报告保存在忽略的 `.local/ui-acceptance/`。四视图专项另有13张截图和报告，位于 `.local/maintenance-ui/`。CI 配置运行检查、测试、构建及两组浏览器验收，上传隔离示例的验收截图。

## 设计依据与边界

- [整体设计](docs/design.md)、[源码审查](docs/research/source-review.md)、[mini-trellis 取用边界](docs/research/mini-trellis.md)
- [17 张独立交互图](docs/ui/interaction-previews/README.md)、[视觉验收](design-qa.md)、[维护记录](docs/maintenance/2026-11.md)

外部工具直接编辑约束时，当前还没有最后已审快照或自动送审；`context` 读取磁盘现状。已有候选仍会在批准前核对版本并阻止覆盖外部新编辑。

首版未实现工程笔记的归档写入、原始聊天历史导入、跨设备同步或后台自动提炼。提炼质量取决于加载 Skill 的宿主 Agent，尚未进行真实对话准确率评估。文件查看按单文件 1 MB 与扫描上限工作，结果不完整时给出提示。

使用 AGPL-3.0，保留上游依赖的许可与归属，见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
