# 开源底座源码审查

> 这是设计前的源码调研快照。当前应用能力、使用方法和验收以仓库 README 与 design-qa 为准。

审查日期：2026-11-24。结论基于下面固定提交的实际源码与隔离探针，不把 README 功能清单或社区热度当作实现证明。

| 项目 | 审查版本 | 在本项目的位置 |
| --- | --- | --- |
| [CloudCLI / claudecodeui](https://github.com/siteboon/claudecodeui/tree/b6959148ec006f258d737e72bb630ff2e5e84672) | 1.37.9 · `b6959148ec006f258d737e72bb630ff2e5e84672` | 可选宿主入口 |
| [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin/tree/fcb5e3adc1890db34f482f73e2449f3c57a2f423) | 3.38.3 · `fcb5e3adc1890db34f482f73e2449f3c57a2f423` | 经验筛选与精简方法参考 |
| [ECC](https://github.com/affaan-m/ECC/tree/4adeee6732a12d1540f49a4d50a38ce8c97f9a53) | 2.2.3 · `4adeee6732a12d1540f49a4d50a38ce8c97f9a53` | 提炼、作用域与依据的参考 |

**最终推荐改为 mini-trellis core**：它补上了可直接依赖的文档发现、来源引用与日志实现。CE 不再作为代码底座，其规则包解析器也不与 mini-trellis 重复引入。详见 [mini-trellis 专项审查](mini-trellis.md)；下文保留前三个候选的代码依据。

## 1. CloudCLI：有界面扩展点，但宿主不是轻量文件工作台

**代码路径：** 插件页加载 bundle → `mount(container, pluginHostApi)` → `rpc()` 请求宿主 → 宿主转发到插件后端。`pluginHostApi` 提供项目／会话上下文、上下文变更订阅和 RPC，没有通用文档编辑器、文件审核或维护日志 API。见 [PluginTabContent.tsx:15–44、89–138][cloud-ui] 与 [plugins.routes.ts:39–61][cloud-routes]。

插件后端由 `startPluginServer()` 再启动一个 Node 进程，通过 stdout 的 ready／port 握手登记，超时十秒；宿主会启动已启用插件的后端。宿主项目管理通过自己的 `projectsDb` 持久化项目。见 [plugin-process.service.ts:54–137、200–216][cloud-process] 和 [project-management.service.ts:4、44–60、88–135][cloud-project]。

**判断：** 可以做工作台的一个入口，却不能把它的项目页直接当成六项需求已经实现。以整个宿主为必选底座，会一并带入会话、终端、Agent SDK、数据库和插件进程生命周期；目前没有需求证明这些是必要成本。选择独立模式后按需适配，其缺席不影响文件或审核功能。这是结构推断，未做启动内存、安装大小或性能对比。

## 2. Compound Engineering：最接近文件约束与可持续留档

**规则路径：** 项目配置与个人本机配置声明来源 → `packs-resolve.py` 解析路径／Git 来源 → 枚举规则包 → 消费方按适用条件读规则。两个配置层是追加组合，同 ID 不允许个人项替换项目项；本地来源可以是绝对路径。见 [packs-resolve.py:1–59、555–647、681–728][ce-resolver]。

规则模板以 `title` 和 `applies_when` 说明规则及读取时机。顶层 Markdown 才作为规则发现，子目录用于证据；发现器对 frontmatter 的检查只是识别门槛，不能冒充完整结构校验。路径检查处理 realpath 和越界链接。见 [规则模板][ce-template] 和 [解析器:364–382、443–472、619–645][ce-resolver]。

**留档路径：** `ce-compound` 先判断经验是否值得持久化，再选择更新已有经验或最小记录；轻量路径不需要完整并行评审。refresh 的 worth audit 会检查已有代码／检查是否已经表达推理，从而建议缩短、移除或收窄规则。见 [ce-compound:19–38][ce-capture]、[lightweight.md][ce-light] 和 [worth-audit.md:11–38][ce-worth]。

**必须改的边界：** 上游 Write boundary 允许在每种模式中直接写选定的检查／标准／经验文档，部分指令入口才单独征求同意。它并不是“任何新约束都先审核”的系统。工作台必须把所有约束新增、修改和删减改为提案，不直接运行原始写入流程。见 [ce-compound:60–64][ce-capture]。

**接入陷阱：** 解析器把错误放进 JSON 的 `errors`，解析正常完成时仍返回 0；调用方不能只看退出码。本次探针实际复现。Git 来源要求 `ref`，但允许分支名；若以后支持远程发布，需另定不可变版本约束。首版只保留已登记的本地来源，不引入远程包同步。见 [解析器:35–49、648–659][ce-resolver]。

**判断：** 适合派生为文件底座，不能把 CE 整体称为轻量看板，也无需安装整个插件及其转换工具。新的审核和展示层是本项目真正需要补的部分。

## 3. ECC：提炼信号有价值，置信度不能代替批准

**学习路径：** 工具事件观察 → observer 从纠正、错误解决、重复流程与工具偏好中归纳 → 写入项目或全局 `instincts/personal/`。observer 配置默认关闭，因此不能描述成安装即自动常驻运行。见 [observer.md:11–119][ecc-observer]、[config.json][ecc-config] 和 [observe.sh][ecc-observe]。

**生效路径：** SessionStart 从项目／全局的 personal 和 inherited 目录读取，按置信度过滤，再结合项目及技术栈相关性排序、截取后注入上下文。这段逻辑不要求每条内容带人审批准状态。见 [session-start.js:458–518][ecc-start]。仓库也存在 pending 清理能力，但不能据此推断 observer 的 personal 输出都先经过 pending 审核。

**已有的人机交互：** `instinct-cli.py` 的推广命令有 dry-run，通常会询问是否提升为全局，也提供 force。不能说 ECC 完全没有人工确认；准确缺口是它没有覆盖每次规则初始生效及更新的统一批准门槛。见 [instinct-cli.py:1629–1684、2092–2183][ecc-cli]。

**判断：** 采用“触发条件、来源证据、默认项目范围、显式推广”的表达方式；不移植观察守护进程、全量事件档案和自动注入链。首版不需要 confidence 评分，直接给用户看原话摘要、建议规则和精确 diff。跨项目重复只能支持推广建议，不能自动改全局规则。

## 4. 前三个候选的可取用对象与当前边界

| 对象 | 计划动作 | 需要改造的地方 |
| --- | --- | --- |
| CE `skills/ce-compound/scripts/packs-resolve.py` | 备选参考；已有 mini-trellis 文档发现后，不再引入第二套 resolver | 工作台使用显式注册表；不复制完整 Git 克隆缓存与配置层；消费 `errors`；非 Git 目录也能登记 |
| CE `skills/ce-setup/assets/pack-rule-template.md` | 精简为可选模块规则模板 | 不强迫普通 AGENTS.md 加元数据；明确文档读取路由 |
| CE `skills/ce-compound/scripts/validate-frontmatter.py` | 参考其解析风险检查，确有需要再提取 | 它不是完整 schema validator；若声明字段结构，另行校验 |
| CE `references/lightweight.md`、`assets/resolution-template.md`、`references/refresh/worth-audit.md` | 压缩成提炼与维护说明 | 删掉完整工作流和特殊模式；保留理由／结果／证据；所有规则写入和删除都经审核 |
| ECC `agents/observer.md`、`instinct-cli.py` 中的作用域表达 | 提炼为候选协议的字段和判断提示 | 不移植整个 CLI；候选隔离存放；promotion 也是独立提案 |
| CloudCLI `PluginTabContent.tsx` 公开宿主表面 | 以后编写薄适配器时遵循接口 | 先验证同一服务的连接方式；不依赖宿主私有 DB；不复制宿主代码进核心 |

上表是候选复用对象；最终由 mini-trellis 承担文档和来源代码能力，CE/ECC 以方法和短协议为主。当前仓库没有 vendored 上游产品代码。看板与审核服务需要实现，但不另造一套 Agent 执行框架。

## 5. 实际验证与局限

复核脚本：[probe_upstreams.py](probe_upstreams.py)；本次结果：[verification.json](verification.json)。将对应提交检出到 `UPSTREAMS/compound`、`UPSTREAMS/ecc`、`UPSTREAMS/cloudcli`、`UPSTREAMS/mini-trellis`，并按专项审查安装 mini-trellis 的测试依赖后运行（需要 Python 3.11+、Git、Node、pnpm）：

```sh
python3 docs/research/probe_upstreams.py --upstreams /path/to/UPSTREAMS
```

脚本创建临时 Git 夹具，并将 ECC 数据目录隔离；不会读取或修改真实的个人规则。它不是工作台验收测试。

- CE 五项检查通过：双层本地来源组合；嵌套证据规则不成为独立活动包；重复 ID 返回 errors 且进程退出 0；缺 ref 的远程来源被拒绝；越界符号链接被拒绝。
- ECC 两项探针通过：越界置信度回退为 0.5；导入与解析没有创建持久状态。
- ECC 上游相关性测试：20 passed，0 failed；作为第八项脚本检查汇总。
- mini-trellis 的 123 项核心测试和三项真实日志探针通过，详见[专项审查](mini-trellis.md)。
- CloudCLI 只做源码调用链与依赖边界检查，没有启动宿主或运行插件集成测试。

未运行 CE 的完整 Bun 测试、ECC 的全套钩子与 pytest、三个项目的端到端安装。未验证新看板、审核恢复、真实对话提炼质量或跨 Agent 加载；这些属于后续实现验收。尚未做用户项目的文档迁移，也没有修改任何现存全局规则。版本与研究判断见[证据台账](sources.json)。

## 6. 许可与选择边界

mini-trellis 的 AGPL 许可与具体复用边界见[专项审查](mini-trellis.md)。CE 与 ECC 的审查版本使用 MIT；实际取用代码或模板时保留原许可和归属。CloudCLI 的 LICENSE 为 AGPL-3.0 并含 Section 7 的额外归属条款，不能把整仓代码按本项目偏好随意改标许可。本轮只引用源码作研究；未来若复制、派生或分发适配内容，按实际方式再核对许可义务。见 [CE LICENSE][ce-license]、[ECC LICENSE][ecc-license] 与 [CloudCLI LICENSE][cloud-license]。

[cloud-ui]: https://github.com/siteboon/claudecodeui/blob/b6959148ec006f258d737e72bb630ff2e5e84672/src/modules/plugins/PluginTabContent.tsx#L89-L138
[cloud-routes]: https://github.com/siteboon/claudecodeui/blob/b6959148ec006f258d737e72bb630ff2e5e84672/server/modules/plugins/plugins.routes.ts#L39-L61
[cloud-process]: https://github.com/siteboon/claudecodeui/blob/b6959148ec006f258d737e72bb630ff2e5e84672/server/modules/plugins/plugin-process.service.ts#L54-L137
[cloud-project]: https://github.com/siteboon/claudecodeui/blob/b6959148ec006f258d737e72bb630ff2e5e84672/server/modules/projects/services/project-management.service.ts#L1-L135
[ce-resolver]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-compound/scripts/packs-resolve.py
[ce-template]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-setup/assets/pack-rule-template.md
[ce-capture]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-compound/SKILL.md#L19-L64
[ce-light]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-compound/references/lightweight.md
[ce-worth]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/skills/ce-compound/references/refresh/worth-audit.md
[ecc-observer]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/skills/continuous-learning-v2/agents/observer.md#L11-L119
[ecc-config]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/skills/continuous-learning-v2/config.json
[ecc-observe]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/skills/continuous-learning-v2/hooks/observe.sh
[ecc-start]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/scripts/hooks/session-start.js#L458-L518
[ecc-cli]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/skills/continuous-learning-v2/scripts/instinct-cli.py
[ce-license]: https://github.com/EveryInc/compound-engineering-plugin/blob/fcb5e3adc1890db34f482f73e2449f3c57a2f423/LICENSE
[ecc-license]: https://github.com/affaan-m/ECC/blob/4adeee6732a12d1540f49a4d50a38ce8c97f9a53/LICENSE
[cloud-license]: https://github.com/siteboon/claudecodeui/blob/b6959148ec006f258d737e72bb630ff2e5e84672/LICENSE#L664-L705
