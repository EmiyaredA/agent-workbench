# mini-trellis 源码审查与改选依据

> 这是设计前的源码调研快照。当前应用能力、使用方法和验收以仓库 README 与 design-qa 为准。

审查 [v0.4.2，提交 `0f37e0f2115da85e7bdcdbaebeea038a8080bae8`](https://github.com/Tiger-zzZ/mini-trellis/tree/0f37e0f2115da85e7bdcdbaebeea038a8080bae8)，日期 2026-11-24。结论：**比 CE 更适合作为代码底座，仍需补齐全局管理与逐次人审。**

## 已有的真实实现

| 代码 | 能复用什么 | 边界 |
| --- | --- | --- |
| [core 包][package]、[公共导出][exports] | 独立 `mini-trellis-core`，无声明的生产依赖，提供文档、来源与会话 API | 不是只有提示词；但仍含多种会话适配器及 SQLite 只读逻辑，未测最终 bundle／内存 |
| [docs.ts][docs] | `discoverDocs` 发现根入口、docs/doc 与 `.trellis/spec|research|workspace`；检查文件大小、数量、深度、时间和越界链接 | 普通文档遵循 Git ignore；`.trellis` 有例外；发现文档不等于判定为有效规则 |
| [docs.ts:74–127][docs] | 最近 `.trellis`／独立 Git 根边界；相邻 worktree 与独立子仓库隔离 | 不可绕过项目边界读任意全局文件，全局需单独登记 |
| [recall.ts][recall]、[types.ts:245–333][types] | 摘录、路径、位置、来源指纹、变化提示，适合可视化依据 | `recallMem` 同时扫描文档和会话，当前没有 doc-only 参数，不应每次开看板就调用 |
| [lineage.ts][lineage] | `superseded_by` 文档替代关系与目标路径校验 | 足够表达当前／旧方案的关系，无须图数据库；不是所有替代关系都要自动生成 |
| [projects.ts:23–38][projects] | 根据本机会话 cwd 聚合项目 | 全局扫描会话，不是项目注册表，不默认用于工作台总览 |
| [add_session.py][journal] | topic/change/test/next-step，锁、指纹、idempotency key、journal 与索引的重试收敛 | 记录状态校验不验证主题语义，更不代表人审批准；有历史兼容逻辑，不能整段无差别搬入 |

项目已有 mini-trellis 时，继续使用原 `.trellis/workspace/<name>/journal-*.md`，工作台直接读取。新项目可沿用 docs/maintenance，不要求先初始化全部宿主模板。默认配置 `session_auto_commit: false`，已有安装调用记录器时额外强制 `--no-commit`。见 [config.yaml][config]。

## 六项需求的缺口

| 需求 | 已有基础 | workbench 补充 |
| --- | --- | --- |
| 项目 AGENTS.md | 项目入口及现有文档发现 | 偏好视图、准确 diff 与审核 |
| 全局 AGENTS.md | 以项目为中心的边界 | 独立来源、Agent 读取入口、影响范围 |
| 模块约束 | spec、docs 和包配置 | 适用目录、按任务读取路由，可不启用 |
| 维护日志 | journal、topic、索引和重试 | 跨项目时间线、兼容既有日志 |
| 自动提炼后人审 | remember／session-insight 的提炼及留档说明 | 候选隔离、版本绑定批准、外部修改冲突 |
| 项目管理看板 | 可调用的 core | 注册表、三层约束、审核队列、维护路径 |

## 必须改掉的自动写入边界

[remember.md:3–29][remember] 在用户确认或纠正规则后，即使没说 remember，也指导 Agent 编辑主题并留日志；[update-spec.md][update] 同样指导直接修改现有主题。**确认了观点，不等于审阅并批准了具体文件差异。** 原样安装不能声称满足逐次人审。

保留其准确表达条件／否定／例外、更新原主题、不重复堆积的原则；把输出改成待审提案。用户看到精确 diff 后，才由 workbench 写入有效规则并记日志。普通事实性维护记录不会自动升级为规则。用户原话、被否决方案、旧文档和有效指令也必须区分。

## 融合方式与轻量边界

- **mini-trellis**：真正复用的代码底座，优先公共 core；兼容既有 journal，不再造同类来源能力。没有完整 fork 的必要。
- **CE**：吸收经验价值门槛和失效清理方法；模块规则可参考 `applies_when`，不再引入第二套 packs resolver。
- **ECC**：吸收纠正／重复偏好的触发信号、项目范围和依据表达；不带 observer、全量工具观察或置信度批准。
- **CloudCLI**：有实际入口需求再适配，独立模式不依赖它。

实际运行优先一个 Node 包和本机进程，无数据库或专属模型服务。宿主历史读取是可选的依据补充，不作为看板启动依赖。详细数据与审核流程见[整体设计](../design.md)。

## 实际验证及局限

在隔离克隆中执行：

```sh
pnpm install --filter mini-trellis-core --frozen-lockfile --ignore-scripts
pnpm --filter mini-trellis-core exec vitest run test/mem/recall.test.ts test/mem/api.test.ts
```

两组共 **123 项测试通过**。另以真实模板脚本在临时 Git 仓库中验证：主题链接进入日志；相同 idempotency key 重试不改 journal／index；配置 auto-commit true 时 `--no-commit` 没有产生提交。复核见 [probe_upstreams.py](probe_upstreams.py) 和 [verification.json](verification.json)。

未运行全部 CLI 初始化／迁移／宿主集成测试，没有故障注入，没有访问用户真实聊天，没有安装进用户项目。上游测试通过不等于新看板或审核流程已实现。

许可为 AGPL 系列：包元数据写 `AGPL-3.0-only`，COPYRIGHT 含“或更高版本”的表述。正式复用应保留原 LICENSE／COPYRIGHT 并核对所取发布内容，不能统一改标 MIT。当前公开工作台建议按兼容 AGPL 的方式复用；本轮没有导入产品实现。见 [LICENSE][license]、[COPYRIGHT][copyright]。

[package]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/package.json
[exports]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/index.ts
[docs]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/docs.ts
[recall]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/recall.ts
[types]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/types.ts
[lineage]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/lineage.ts
[projects]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/core/src/mem/projects.ts
[journal]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/trellis/scripts/add_session.py
[config]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/trellis/config.yaml
[remember]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/common/commands/remember.md
[update]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/packages/cli/src/templates/common/skills/update-spec.md
[license]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/LICENSE
[copyright]: https://github.com/Tiger-zzZ/mini-trellis/blob/0f37e0f2115da85e7bdcdbaebeea038a8080bae8/COPYRIGHT
