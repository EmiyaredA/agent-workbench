// Fictional examples only. seedDemo writes these under its isolated data directory.
const rule = (file, title, when, body) => ({ file, title, when, content: `# ${title}\n\n> 何时读取：${when}\n\n${body.trim()}\n` });

export const demoProjects = [
  {
    name:'agent-workbench', description:'一个本机运行的多项目约束与维护工作台。文件保存正式内容，界面负责阅读、审核和交接。',
    rules:[
      rule('architecture','文件与运行边界','调整目录、依赖或进程职责时。',`
## 正式来源
- 项目入口是根目录 AGENTS.md，补充约束保存在 .agent-workbench/rules/。
- 每条约束只有一份当前正文，相关文件通过 Markdown 链接引用。
- 首版使用本机 Node 进程与文件，不引入独立数据库或常驻模型服务。

## 边界
正式规则、待审候选和维护背景分开保存。候选不能因重复出现就自动生效。

## 扩展条件
只有当前实现无法满足已确认需求时才增加运行依赖。选型先写清收益、成本和退出方式。`),
      rule('frontend','界面与交互','修改导航、列表、表单或阅读体验时。',`
## 信息密度
- 页面以文档内容为主，避免无意义的统计卡片。
- 入口文件与其他约束按真实目录树一起呈现，目录可折叠。
- 工程决策四视图读取同一批笔记；实际迭代通过明确链接关联。
- 筛选和主要操作同行，正文保持可读字号。

## 资源与反馈
- 字体与图标使用本地资源。
- 错误显示在原操作附近，失败时保留已填内容。
- 控件提供键盘焦点，弹窗支持 Esc 关闭。

## 关联
涉及 Markdown 呈现和文件写入时，还要阅读 [存储与恢复](storage.md)。`),
      rule('storage','存储与中断恢复','调整读写、冲突处理或应用回执时。',`
## 写入前
- 校验登记目录、目标路径、原文版本和候选版本。
- 拒绝越界路径和符号链接，不因为索引中的链接扩大访问范围。

## 写入过程
使用同目录临时文件与原子替换，保留原文件权限。文件写入和维护日志可能分步完成，要记录应用回执。

## 恢复
恢复先核对文件现状，不覆盖中断后用户新增的编辑。只读查询不触发恢复写入，重复完成操作不重复留日志。`),
      rule('review','提案与审核','从对话提出新偏好、修改或精简旧规则时。',`
## 提案应包含
| 内容 | 要回答的问题 |
| --- | --- |
| 修改理由 | 为什么需要长期保留？ |
| 来源摘要 | 用户在哪种条件下提出或纠正？ |
| 完整建议 | 用户批准后文件具体变成什么？ |

## 生效边界
用户查看准确差异后才能写入。批准绑定具体版本，原文变化时停止应用并重新核对。

## 做减法
临时要求不必变成永久规则。发现重复或失效内容时提出合并、收窄或删除建议，仍经审核。`),
      rule('testing','验证与交付','改变用户流程、文件协议或构建方式时。',`
## 验证选择
- 文件写入与恢复使用隔离目录，不操作真实项目数据。
- 关键交互在浏览器验证，记录实际结果和截图。
- 样式调整重点检查首屏、窄屏和键盘操作。

## 交付
说明改动、已运行的检查和未验证的部分。构建成功只证明能产出文件，不能代替功能验收。

## 关联
需要交给另一个 Agent 继续时，阅读 [维护与交接](handoff.md)。`),
      rule('handoff','维护与跨 Agent 交接','完成重要修改、恢复上下文或更换开发工具时。',`
## 留什么
记录背景、实际结果、验证与后续，必要时保留放弃方案的理由。不复制整段聊天。

## 怎么读
先读项目入口和约束索引，按任务展开相关文件；只有需要追溯原因时再查维护日志和工程决策。

## 约束与历史
被否决的方案用于避免重犯，已归档记录用于追溯。它们不能替代当前有效约束。`),
    ],
    events:[
      {
        "date": "2026-11-25",
        "title": "四个标签统一读取决策笔记",
        "category": "feature",
        "background": "演进时间线曾默认显示 journal，切换到清单后条目和日期发生变化，用户无法追踪同一个决定。",
        "result": "四视图使用同一批决策及筛选；时间线按决策日期排列。实际改动留在迭代日志，通过链接关联。",
        "verification": "示例验收场景：按“架构设计”筛选后依次切换四视图；点开“文件作为唯一正式来源”，四处应打开同一个文件。",
        "next": "补充无备选、无日期及零匹配的浏览案例。",
        "decisions": [
          "decision-views",
          "file-first"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "date": "2026-11-25",
        "title": "决策详情的关联在当前抽屉切换",
        "category": "bug-fix",
        "background": "从一个决定打开前置决定时叠加新弹窗，关闭后难以回到原先的阅读位置。",
        "result": "统一用一个右侧抽屉替换正文，保留背景筛选；支持前后退、Esc 和原文模式。",
        "verification": "示例验收场景：决策 A → 前置决定 B → 浏览器后退回 A；全程只有一个抽屉，关闭后仍回原卡片。",
        "next": "补查手机键盘焦点和长文段落链接。",
        "decisions": [
          "same-page-detail",
          "decision-views"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "date": "2026-11-24",
        "title": "约束改为可折叠的真实目录树",
        "category": "feature",
        "background": "平铺列表重复出现相同父路径；“入口”和“模块”分区让一个目录里的文件被拆开。",
        "result": "AGENTS.md 与规则目录按真实层级一起展示；折叠目录后切换文件会展开目标路径。",
        "verification": "示例验收场景：折叠 rules 后从相对链接进入 frontend.md，应展开对应目录并定位文件。",
        "next": "观察规则超过一百份时是否需要采用文件筛选方案。",
        "decisions": [
          "directory-tree"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "date": "2026-11-23",
        "title": "批准时发现原文变化便停止写入",
        "category": "process",
        "background": "提案生成后又出现用户编辑，按旧基线应用会丢失新内容。",
        "result": "展示基线、当前原文和原建议；保留冲突提案，重新生成后再次审核。",
        "verification": "示例验收场景：待审期间追加一行，再批准，应提示冲突且保留追加内容。",
        "next": "继续核对来源映射变化后的恢复行为。",
        "decisions": [
          "exact-review",
          "recovery"
        ],
        "files": [
          ".agent-workbench/rules/review.md",
          ".agent-workbench/rules/storage.md"
        ]
      },
      {
        "date": "2026-11-22",
        "title": "把验证范围留在具体维护条目中",
        "category": "testing",
        "background": "只写“构建通过”让接手者误以为写入、冲突和恢复都已验收。",
        "result": "维护条目列出实际检查、截图入口与缺失验证，决策正文只保留验证策略的理由。",
        "verification": "示例验收场景：分别阅读决策的验证策略和本次维护记录，能够分清原则、结果和未执行项。",
        "next": "真实项目中补入对应报告路径；本演示不提供伪造的通过报告。",
        "decisions": [
          "proof"
        ],
        "files": [
          ".agent-workbench/rules/testing.md"
        ]
      },
      {
        "date": "2026-11-20",
        "title": "恢复前先核对文件和回执",
        "category": "bug-fix",
        "background": "文件替换成功但日志尚未追加时进程退出，重新执行原操作可能覆盖后来的编辑。",
        "result": "恢复根据实际 hash 分支处理；已写入时只补回执与日志，版本再次变化则停止。",
        "verification": "示例验收场景：分别模拟替换前、替换后及用户再编辑后的中断，核对恢复动作各不相同。",
        "next": "为恢复失败保留可核对的操作标识。",
        "decisions": [
          "recovery"
        ],
        "files": [
          ".agent-workbench/rules/storage.md"
        ]
      },
      {
        "date": "2026-11-08",
        "title": "主导航旁收拢页面操作",
        "category": "simplification",
        "background": "提案筛选和维护视图独占正文一行，文档首屏被重复标题挤占。",
        "result": "收拢到顶部当前页操作区，月份、类别、统计和搜索保持紧凑一行。",
        "verification": "示例验收场景：桌面切换四视图，筛选条高度不跳变；窄屏允许自然换行且无页面横向溢出。",
        "next": "新增控件前核对可用宽度。",
        "decisions": [
          "compact-navigation"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "date": "2026-10-22",
        "title": "区分全局偏好与项目规则入口",
        "category": "process",
        "background": "全局文件混在某个项目中，容易被理解为这个项目专属规则。",
        "result": "全局偏好有独立入口，项目切换不自动复制全局正文。",
        "verification": "示例验收场景：从两个项目进入全局偏好，读到同一份文件，项目的待审提案数量互不混用。",
        "next": "跨项目推广仍单独创建约束提案。",
        "decisions": [],
        "files": [
          "AGENTS.md",
          ".agent-workbench/rules/review.md"
        ]
      },
      {
        "date": "2026-09-18",
        "title": "记录固定路径读取的适用范围",
        "category": "architecture",
        "background": "原型只有一个本机目录，尚未建立多个来源的登记协议。",
        "result": "原型采用固定路径；这次记录只说明历史起点，之后的登记方案由新决策接管。",
        "verification": "示例复盘场景：打开历史决定后沿替代链接进入当前文件来源决定，不把旧路径当成当前规则。",
        "next": "后续替代关系留在新决定与明确链接中。",
        "decisions": [
          "old-paths"
        ],
        "files": [
          "AGENTS.md"
        ]
      }
    ],
    decisions:[
      {
        "status": "implemented",
        "category": "architecture",
        "date": "2026-11-24",
        "slug": "file-first",
        "title": "文件作为唯一正式来源",
        "problem": "项目约束被复制到不同工具的聊天状态后容易漂移；换 Agent 时也无法核对哪一份才是当前正文。",
        "choice": "项目 Markdown 保存当前约束和维护背景。工作台只保存目录映射、候选、具体版本的审核回执；读操作不自动写入或修复文件。",
        "consequence": "- 收益：更换 Agent 后仍能阅读和核对版本，项目可独立迁移。\n- 代价：目录和相对链接需要维护，当前没有跨设备同步。",
        "alternatives": [
          {
            "title": "把约束放进工作台数据库",
            "reason": "查询和关联更方便，也适合未来多设备同步；当前却需要同时维护文件与数据库，出现冲突还要决定由谁覆盖，因此保留文件事实来源。"
          },
          {
            "title": "每个 Agent 各存一份规则副本",
            "reason": "接入现有工具快、离线可用；更新无法同步且容易遗留旧规则，改为让不同 Agent 按需读取同一文件。"
          }
        ],
        "links": [
          "old-paths"
        ],
        "files": [
          ".agent-workbench/rules/architecture.md"
        ]
      },
      {
        "status": "implemented",
        "category": "simplification",
        "date": "2026-11-08",
        "slug": "compact-navigation",
        "title": "导航与筛选合并为紧凑工具栏",
        "problem": "页头留白让用户需要滚动才能看到差异。",
        "choice": "减少重复标题与说明，主要操作集中在内容附近。",
        "consequence": "首屏容纳更多内容；新手说明转移到按需入口。",
        "alternatives": [
          {
            "title": "保留每页独立介绍区",
            "reason": "第一次使用时层次鲜明、说明容易发现；日常反复阅读时占据首屏，说明改放在按需入口。"
          },
          {
            "title": "把全部筛选收入弹窗",
            "reason": "正文最干净；但看不到当前筛选，也会增加高频操作步骤，因此保留一行常用筛选。"
          }
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "status": "implemented",
        "category": "feature",
        "date": "2026-11-24",
        "slug": "directory-tree",
        "title": "按真实目录展示约束",
        "problem": "平铺列表反复显示相同路径，难以看清文件归属。",
        "choice": "统一展示项目入口和规则目录，按层级折叠。",
        "consequence": "查找更直观；需要处理展开状态和键盘操作。",
        "alternatives": [
          {
            "title": "项目入口和模块分成两栏",
            "reason": "容易单独强调入口文件；同一目录被拆开，阅读和定位都增加切换。"
          },
          {
            "title": "所有文件平铺并重复完整路径",
            "reason": "实现简单，文件很少时扫描快；目录变深后相同前缀挤占宽度，因此使用可折叠层级。"
          }
        ],
        "links": [
          "file-first",
          "compact-navigation"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "status": "implemented",
        "category": "process",
        "date": "2026-11-23",
        "slug": "exact-review",
        "title": "批准约束前核对具体版本",
        "problem": "候选生成后，用户仍可能继续修改文件。",
        "choice": "审核绑定原文与候选版本，发生变化时重新展示差异。",
        "consequence": "保留后续编辑；冲突需要再次审阅。",
        "alternatives": [
          {
            "title": "生成候选后直接覆盖",
            "reason": "操作最少，适合一次性脚本；审核期间可能出现新编辑，必须先核对两个版本。"
          },
          {
            "title": "发现变化后自动合并并批准",
            "reason": "能减少人工干预；用户却没有审阅最终合并文本，因此合并仍需要重新展示差异。"
          }
        ],
        "files": [
          ".agent-workbench/rules/review.md"
        ]
      },
      {
        "status": "implemented",
        "category": "testing",
        "date": "2026-11-22",
        "slug": "proof",
        "title": "验证结果随迭代记录保存",
        "problem": "仅有构建通过不能说明交互正常。",
        "choice": "记录真实执行的检查及缺失验证，证据跟随具体迭代。",
        "consequence": "交接可复核；普通微调按影响选择检查。",
        "links": [
          "exact-review"
        ],
        "files": [
          ".agent-workbench/rules/testing.md"
        ],
        "alternatives": [
          {
            "title": "每次任务强制生成完整报告会增加无效负担",
            "reason": "每次任务强制生成完整报告会增加无效负担。"
          }
        ]
      },
      {
        "status": "implemented",
        "category": "bug-fix",
        "date": "2026-11-20",
        "slug": "recovery",
        "title": "恢复时先核对实际文件",
        "problem": "写入被中断后，回执可能落后于磁盘内容。",
        "choice": "先核对实际文件，再补齐回执与日志，不覆盖后续编辑。",
        "consequence": "恢复更稳；需要覆盖部分失败的核对顺序。",
        "alternatives": [
          {
            "title": "重启后直接重放原写入",
            "reason": "逻辑简单，原子替换本身也可重复；但原子性只覆盖一个文件，不能保证回执、日志与用户后续编辑一致。"
          },
          {
            "title": "一律回滚到旧文件",
            "reason": "状态容易解释；用户可能已继续编辑，回滚会抹去新内容，因此先核对现状再决定补齐步骤。"
          }
        ],
        "links": [
          "file-first",
          "exact-review"
        ],
        "files": [
          ".agent-workbench/rules/storage.md"
        ]
      },
      {
        "status": "implemented",
        "category": "architecture",
        "date": "2026-09-18",
        "slug": "old-paths",
        "title": "早期固定路径的读取方式",
        "problem": "最初只有单个示例目录。",
        "choice": "曾使用固定路径，现改为登记来源后按需读取。",
        "consequence": "保留演进背景，不作为当前方案。",
        "supersededBy": ".agents/notes/implemented/architecture/2026-11-24-file-first.md",
        "alternatives": [
          {
            "title": "遍历全部磁盘目录发现方便",
            "reason": "遍历全部磁盘目录发现方便，但超出项目边界。"
          }
        ]
      },
      {
        "status": "proposed",
        "category": "feature",
        "date": "2026-11-21",
        "slug": "file-filter",
        "title": "在约束列表内增加文件筛选",
        "problem": "未来文件较多时可能难以定位。",
        "choice": "拟增加当前项目内的轻量筛选，先观察真实使用。",
        "consequence": "待验证；这份方案尚未实现。",
        "links": [
          "directory-tree"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ],
        "alternatives": [
          {
            "title": "直接引入全文检索服务能力更强",
            "reason": "直接引入全文检索服务能力更强，但当前规模未证明必要。"
          }
        ]
      },
      {
        "status": "rejected",
        "category": "architecture",
        "date": "2026-10-15",
        "slug": "observer",
        "title": "常驻观察服务",
        "problem": "希望从对话中自动识别值得保留的偏好。",
        "choice": "拟启动一个常驻观察进程，采集工具事件和对话片段，自动产生长期偏好候选。",
        "consequence": "示例结论：首版不采用常驻观察。",
        "rejectionReason": "当前按需提炼足以覆盖使用场景；常驻采集会增加隐私范围、推理成本和另一套持久状态，首版不采用。",
        "alternatives": [
          {
            "title": "逐次保存完整聊天",
            "reason": "最大限度保留来源，便于回放；与按需读取和最小保存范围冲突，因此不采纳。"
          }
        ],
        "files": [
          ".agent-workbench/rules/handoff.md"
        ]
      },
      {
        "status": "archived",
        "category": "process",
        "date": "2026-09-25",
        "slug": "manual-copy",
        "title": "手动复制约束的早期流程",
        "problem": "最初依靠手工复制文件让另一个 Agent 读取。",
        "choice": "早期采用手动复制路径，现已由仓库内 Skill 替代。",
        "consequence": "仅保留迁移背景，不作为当前操作指引。",
        "files": [
          ".agent-workbench/rules/handoff.md"
        ],
        "alternatives": [
          {
            "title": "自动安装脚本更方便",
            "reason": "自动安装脚本更方便，但初期需要先验证目录和读取协议。"
          }
        ]
      },
      {
        "status": "implemented",
        "category": "feature",
        "date": "2026-11-25",
        "slug": "decision-views",
        "title": "同一批决策提供四种阅读视图",
        "problem": "用户切换四个标签时，时间线出现另一套日志，无法连续追踪同一篇决定。",
        "choice": "架构基线、演进时间线、避坑智库与决策清单都从同一批 .agents/notes 派生；共用筛选，打开同一源文件。journal 作为关联背景单独阅读。",
        "alternatives": [
          {
            "title": "把 mini journal 作为默认演进时间线",
            "reason": "更贴近每日工作进度，也能直接显示验证结果；它记录的是一次次操作，与一篇决策不是同一个对象，混用会令四个标签的数据身份不一致。"
          },
          {
            "title": "为每种视图各维护一份索引文件",
            "reason": "可以分别排版和标记；同一决定必须重复更新，容易产生不同版本，因此视图只做运行时投影。"
          }
        ],
        "consequence": "- 收益：同一决定在不同视图有稳定身份，筛选和详情可连续使用。\n- 代价：基线与避坑展示有明确用途的子集，数量无需与清单完全相同。",
        "links": [
          "file-first",
          "directory-tree",
          "compact-navigation"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "status": "implemented",
        "category": "bug-fix",
        "date": "2026-11-25",
        "slug": "same-page-detail",
        "title": "决策关联在同一个阅读抽屉中切换",
        "problem": "反复打开关联决定时叠加弹窗，背景滚动和返回位置丢失。",
        "choice": "用一个带遮罩的右侧抽屉读取决定、文档及迭代；关联点击替换内容，浏览器前后退恢复上一条选择。",
        "alternatives": [
          {
            "title": "每次关联都打开新弹窗",
            "reason": "实现局部、无须维护当前选择；多层关闭顺序难以理解，键盘焦点也难管理。"
          },
          {
            "title": "跳到独立详情页",
            "reason": "可以单独分享与刷新；用户需要反复返回看板恢复筛选，因此把选择保存在当前页路由中。"
          }
        ],
        "consequence": "- 收益：保留看板上下文与单层焦点约束。\n- 代价：需要处理返回、关闭、长文滚动和无效链接。",
        "links": [
          "decision-views"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      }
    ],
  },
  {
    name:'portfolio', description:'面向个人项目、写作与作品展示的轻量网站。重点是内容可信、页面清晰和发布可核对。',
    rules:[
      rule('content','内容与项目介绍','新增作品、个人介绍或项目说明时。',`## 内容原则
项目说明写清问题、自己的职责和实际结果。演示数据、推测和真实成果分开表达，不为版面好看编造指标。

## 可维护性
标题和摘要简短，完整过程放详情页。旧项目的外链失效时更新状态，保留有价值的背景。`),
      rule('frontend','页面与响应式布局','修改作品列表、详情页或导航时。',`## 布局
作品卡片优先展示标题、封面与一句话说明。避免为凑齐网格添加无意义的占位内容。

## 可访问性
交互支持键盘和清晰焦点；窄屏导航不遮挡内容。图片加载失败时仍能理解项目主题。

## 关联
新增封面资源时阅读 [图片与素材](assets.md)。`),
      rule('assets','图片与素材','导入封面、截图或字体时。',`## 来源
记录素材来源和使用范围；不提交凭据或未获授权的私人素材。

## 呈现
按实际展示尺寸导出图片，避免拉伸和不必要的大文件。截图注明是否为示意。

## 维护
替换资源时核对引用，未使用的旧文件可以随同改动移除。`),
      rule('publishing','预览与发布','准备合并或公开发布时。',`## 发布前
核对标题、链接、图片和移动端布局，验证首页到作品详情的主要路径。

## 发布动作
生成可审阅的预览，按用户授权推送和发布。发布后核对实际页面，记录版本和已知限制。`),
      rule('maintenance','内容维护','修正过时介绍或交接下一轮编辑时。',`## 留档
记录变更原因和受影响页面，不把逐字改稿过程全部写进长期日志。

## 减少重复
共享介绍由一处维护，页面引用同一来源。常见模板保持少量字段，确有新需求再增加。`),
    ],
    events:[
      {
        "date": "2026-11-22",
        "title": "作品详情分清个人贡献与团队结果",
        "category": "feature",
        "background": "作品页只有功能列表，看不出作者具体负责什么。",
        "result": "正文按问题、个人职责、实际结果重排；无法核对的指标删去，演示截图明确标注。",
        "verification": "示例验收场景：从作品列表进入详情，能找到职责段落和结果来源，不把演示素材当成上线成果。",
        "next": "后续更新外链时同步核对项目状态。",
        "decisions": [
          "project-stories"
        ],
        "files": [
          ".agent-workbench/rules/content.md"
        ]
      },
      {
        "date": "2026-11-18",
        "title": "讨论作品标签，暂不增加分类界面",
        "category": "feature",
        "background": "作品逐渐增多，但目前尚未确认读者需要哪种筛选。",
        "result": "记录少量标签方案及反例，保留 proposed 状态；当前页面仍按原作品列表显示。",
        "verification": "示例评审场景：清单和时间线均显示“方案稿”，打开备选卡也不显示“已采纳”。",
        "next": "有真实查找反馈后再决定是否实施。",
        "decisions": [
          "project-tags"
        ],
        "files": [
          ".agent-workbench/rules/content.md"
        ]
      },
      {
        "date": "2026-11-16",
        "title": "长标题不再遮挡作品返回入口",
        "category": "bug-fix",
        "background": "窄屏时项目名称占两行，返回按钮与标题重叠。",
        "result": "返回入口保持独立可点击区域，标题自然换行；浏览顺序仍是列表到详情。",
        "verification": "示例验收场景：390px 下使用长标题，Tab 进入返回按钮并按 Enter，应回到作品列表。",
        "next": "补看图片加载失败时的首屏。",
        "decisions": [
          "mobile-return"
        ],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "date": "2026-11-03",
        "title": "作品封面统一引用同一份资源",
        "category": "process",
        "background": "同一截图存在多个副本，替换其中一个后列表和详情显示不同版本。",
        "result": "共享封面只保存一份路径，替换时核对列表、详情和替代文本。",
        "verification": "示例验收场景：替换封面后两处使用同一资源；断开图片加载后仍有可理解的替代文本。",
        "next": "新增素材时继续保留来源与使用范围。",
        "decisions": [
          "asset-source"
        ],
        "files": [
          ".agent-workbench/rules/assets.md"
        ]
      },
      {
        "date": "2026-10-19",
        "title": "缩短列表摘要而保留详情背景",
        "category": "feature",
        "background": "长段落挤占作品封面，读者无法快速浏览。",
        "result": "摘要保留问题和一句结果，完整过程留在详情；这次未增加 CMS。",
        "verification": "示例复盘场景：浏览静态内容文件，列表摘要与详情正文均有清楚归属。",
        "next": "下一轮以实际作品页完善介绍结构。",
        "decisions": [],
        "files": [
          ".agent-workbench/rules/content.md"
        ]
      },
      {
        "date": "2026-10-05",
        "title": "发布前核对真实导航与资源",
        "category": "testing",
        "background": "本地构建无法发现部署后的错误相对链接。",
        "result": "在预览环境检查首页、作品详情、返回入口和封面加载。",
        "verification": "示例验收场景：在预览路径下访问深链接再刷新，核对资源路径与返回位置。",
        "next": "真实发布后记录版本与实际页面地址。",
        "decisions": [
          "preview-checks"
        ],
        "files": [
          ".agent-workbench/rules/publishing.md"
        ]
      },
      {
        "date": "2026-09-20",
        "title": "确定首页优先展示代表作品",
        "category": "simplification",
        "background": "首页装饰占据主要空间，用户还未看到作品就要滚动。",
        "result": "减少介绍和统计，作品先按静态列表排布，轮播方案另行留档。",
        "verification": "示例对比场景：第一屏能识别代表作品，无需等待自动轮播。",
        "next": "后续用键盘可达性继续检查交互。",
        "decisions": [],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      }
    ],
    decisions:[
      {
        "status": "implemented",
        "category": "feature",
        "date": "2026-11-22",
        "slug": "project-stories",
        "title": "作品介绍分清职责与结果",
        "problem": "项目介绍容易变成泛泛的功能列表。",
        "choice": "按背景、个人职责和可核对结果组织正文。",
        "consequence": "内容更清楚；需要随项目状态维护。",
        "alternatives": [
          {
            "title": "完整复制项目 README",
            "reason": "最快补齐信息，技术细节也最全；作品读者更需要个人职责与结果，因此保留有来源的短介绍和详情。"
          },
          {
            "title": "统一补一组亮眼指标",
            "reason": "便于横向比较；没有实际证据的数字会造成误导，示意截图也不能证明真实成果。"
          }
        ],
        "files": [
          ".agent-workbench/rules/content.md"
        ]
      },
      {
        "status": "proposed",
        "category": "feature",
        "date": "2026-11-18",
        "slug": "project-tags",
        "title": "增加少量作品标签",
        "problem": "作品数量增加后需要更快定位。",
        "choice": "拟按少量明确主题增加标签，尚未实施。",
        "consequence": "先观察内容规模再决定。",
        "links": [
          "project-stories"
        ],
        "files": [
          ".agent-workbench/rules/content.md"
        ],
        "alternatives": [
          {
            "title": "多级分类更完整",
            "reason": "多级分类更完整，但维护成本偏高。"
          }
        ]
      },
      {
        "status": "rejected",
        "category": "architecture",
        "date": "2026-10-10",
        "slug": "cms",
        "title": "为少量页面增加独立 CMS",
        "problem": "希望让文章编辑更方便。",
        "choice": "拟为少量作品与文章部署独立 CMS，提供多人在线编辑、资源库和权限管理。",
        "consequence": "暂不增加部署和账号管理。",
        "rejectionReason": "当前只有单人维护少量页面，独立部署与账号权限成本高于收益；多人编辑成为确定需求后再评估。",
        "files": [
          ".agent-workbench/rules/content.md"
        ],
        "alternatives": [
          {
            "title": "独立 CMS 对多人编辑有益",
            "reason": "独立 CMS 对多人编辑有益，但当前没有相应规模。"
          }
        ]
      },
      {
        "status": "archived",
        "category": "simplification",
        "date": "2026-09-23",
        "slug": "hero-carousel",
        "title": "首页轮播的早期方案",
        "problem": "曾希望同时突出多个作品。",
        "choice": "旧方案使用轮播，现由静态作品列表替代。",
        "consequence": "保留取舍背景，不作为当前布局要求。",
        "files": [
          ".agent-workbench/rules/frontend.md"
        ],
        "alternatives": [
          {
            "title": "轮播视觉丰富",
            "reason": "轮播视觉丰富，但内容发现和键盘操作更难。"
          }
        ]
      },
      {
        "status": "implemented",
        "category": "bug-fix",
        "date": "2026-11-16",
        "slug": "mobile-return",
        "title": "长标题换行时保留独立返回入口",
        "problem": "作品标题变长后挤压窄屏返回按钮，读者容易失去上下文。",
        "choice": "标题允许换行，返回按钮保持独立点击区与键盘焦点；不改变列表到详情的信息层级。",
        "alternatives": [
          {
            "title": "窄屏隐藏返回按钮",
            "reason": "可以省出标题空间；读者将依赖浏览器手势，无法保证理解当前位置。"
          },
          {
            "title": "所有标题强制截断一行",
            "reason": "布局稳定；关键信息容易丢失，因此保留可读标题。"
          }
        ],
        "consequence": "可读性和返回路径更稳定；需要覆盖长中文标题、键盘与资源失败状态。",
        "links": [],
        "files": [
          ".agent-workbench/rules/frontend.md"
        ]
      },
      {
        "status": "implemented",
        "category": "process",
        "date": "2026-11-03",
        "slug": "asset-source",
        "title": "共享封面由同一个资源路径维护",
        "problem": "复制封面到不同页面目录后，改图容易只改一处。",
        "choice": "列表与详情引用同一资源；素材来源和替代文本随资源一起维护。",
        "alternatives": [
          {
            "title": "每页各复制一份封面",
            "reason": "页面可独立移动；副本更新容易漂移，并增加仓库体积。"
          },
          {
            "title": "接入外部媒体管理服务",
            "reason": "版本与转码能力齐全；当前规模无需多一个账号和运行依赖。"
          }
        ],
        "consequence": "替换和清理更可核对；移动资源时必须检查引用。",
        "links": [],
        "files": [
          ".agent-workbench/rules/assets.md"
        ]
      },
      {
        "status": "implemented",
        "category": "testing",
        "date": "2026-10-05",
        "slug": "preview-checks",
        "title": "发布验收覆盖实际页面路径",
        "problem": "构建只检查文件可生成，不检查部署前缀下的导航。",
        "choice": "预览中核对首页、详情深链接、返回入口和资源加载；真实发布需再次确认并留下版本。",
        "alternatives": [
          {
            "title": "构建完成即视为发布通过",
            "reason": "反馈快、自动化简单；部署路径和失效外链无法由构建代替验证。"
          }
        ],
        "consequence": "能发现路径错误；实际发布操作仍需用户授权，演示不模拟公开上线。",
        "links": [],
        "files": [
          ".agent-workbench/rules/publishing.md"
        ]
      }
    ],
  },
  {
    name:'api-service', description:'提供项目查询与变更记录的示例服务。重点是清晰接口、可恢复写入和跨服务边界。',
    rules:[
      rule('api','接口与错误约定','新增或修改 HTTP 接口时。',`## 接口
请求、响应、错误码与授权校验放在提供方维护。变更优先保持向后兼容。

## 错误
错误说明应帮助调用方决定是否重试，不返回堆栈、凭据或内部路径。

## 关联
涉及写入重试时阅读 [幂等与任务恢复](reliability.md)。`),
      rule('boundaries','跨服务依赖边界','调用其他服务或调整依赖方向时。',`## 公开能力
通过公开 API 或包使用其他服务能力，不读取对方私有表和本地存储。

## 缺失与降级
可选服务不可用时清楚反馈，必选依赖保持单向。不要假定多个仓库能原子发布。`),
      rule('reliability','幂等与任务恢复','增加写操作、长任务或重试时。',`## 重试
重试前核对操作结果，使用稳定的幂等标识。超时不等于服务端没有完成。

## 长任务
考虑取消、部分失败和恢复，持久记录步骤与资源引用。

## 验证
用隔离夹具验证重复请求、中断后恢复和失败反馈。`),
      rule('testing','接口与集成验证','修改输入转换、授权或持久状态时。',`## 验证范围
覆盖真实输入与输出边界，接口定义和契约测试归提供方。

## 数据
测试使用隔离配置和临时存储，不连接真实账号或修改正式数据。

## 交付
说明缺失的跨服务验收，不把结构检查当成功能可用。`),
      rule('operations','配置与运行维护','修改配置、日志或交付方式时。',`## 配置
正式配置与临时诊断分开。凭据通过运行环境提供，不写入示例文件或提交记录。

## 日志
保留排障所需的关联信息，避免输出请求中的私人内容。

## 发布
先提供兼容接口，再迁移调用方。交付记录部署版本、验证结果和回退方式。`),
    ],
    events:[
      {
        "date": "2026-11-24",
        "title": "减少排障日志中的请求正文",
        "category": "simplification",
        "background": "为排查一次失败而保存完整请求，会留下不必要的私人内容。",
        "result": "日志仅保留操作标识、错误类别和必要资源引用，正文不随日志重复保存。",
        "verification": "示例验收场景：发送含敏感字段的夹具，日志可关联请求但不出现原值。",
        "next": "真实集成时另核对调用方是否也记录了正文。",
        "decisions": [
          "minimal-logs"
        ],
        "files": [
          ".agent-workbench/rules/operations.md"
        ]
      },
      {
        "date": "2026-11-23",
        "title": "request_id 方案保留为待评估",
        "category": "feature",
        "background": "客户端报错与服务端日志缺少稳定关联。",
        "result": "提出只在可公开错误中返回 request_id 的方案；尚未修改响应契约。",
        "verification": "示例评审场景：笔记显示方案稿，对应约束提案仍待审，既有接口定义没有被示例自动升级。",
        "next": "确认字段、兼容行为与泄露范围后再实施。",
        "decisions": [
          "request-id"
        ],
        "files": [
          ".agent-workbench/rules/api.md"
        ]
      },
      {
        "date": "2026-11-15",
        "title": "写入响应丢失后复用操作标识",
        "category": "bug-fix",
        "background": "服务端已落盘但响应丢失，客户端重试可能再次写入。",
        "result": "相同标识和载荷返回原结果，不同载荷冲突；重启后仍能核对。",
        "verification": "示例验收场景：第一次请求已写入后丢弃响应，重试只产生一条记录；相同 key 改载荷应报冲突。",
        "next": "补查超时与取消同时发生的边界。",
        "decisions": [
          "idempotent-write",
          "timeout-check"
        ],
        "files": [
          ".agent-workbench/rules/reliability.md"
        ]
      },
      {
        "date": "2026-11-02",
        "title": "私有表访问迁移到公开接口",
        "category": "architecture",
        "background": "调用方直连其他服务存储，发布和权限规则难以独立维护。",
        "result": "用公开 API 交接资源引用，接口及契约测试由提供方维护。",
        "verification": "示例验收场景：提供方升级兼容接口后再切换调用方，不把两个仓库发布当成原子操作。",
        "next": "继续验证可选提供方缺失时的降级。",
        "decisions": [
          "public-api",
          "shared-tables"
        ],
        "files": [
          ".agent-workbench/rules/boundaries.md"
        ]
      },
      {
        "date": "2026-10-21",
        "title": "区分提供方契约与组合交接验收",
        "category": "testing",
        "background": "本地结构检查通过，实际交接仍可能因响应语义不一致失败。",
        "result": "契约测试维护在提供方；调用方按正式接口进行组合验收，并记录缺失部分。",
        "verification": "示例验收场景：提供方返回一个合法但业务失败的结果，调用方应保留状态和可恢复提示。",
        "next": "补齐部分失败的真实交接案例。",
        "decisions": [
          "contract-checks"
        ],
        "files": [
          ".agent-workbench/rules/testing.md"
        ]
      },
      {
        "date": "2026-10-06",
        "title": "超时后先查询结果再决定重试",
        "category": "process",
        "background": "客户端超时可能发生在服务端写入之后。",
        "result": "先用操作标识核对状态，已完成则复用结果，未知结果才进入可恢复重试。",
        "verification": "示例验收场景：分别构造未接收、处理中和已完成状态，客户端不能统一重复提交。",
        "next": "明确取消只停止等待还是取消实际任务。",
        "decisions": [
          "timeout-check"
        ],
        "files": [
          ".agent-workbench/rules/reliability.md"
        ]
      },
      {
        "date": "2026-09-19",
        "title": "登记接口复制的历史背景",
        "category": "architecture",
        "background": "原型缺少公开包，调用方先复制了接口定义。",
        "result": "记录旧做法的适用范围及风险，后续由提供方接口接管。",
        "verification": "示例复盘场景：归档只用于追溯，不在新代码中按旧定义继续扩展。",
        "next": "替代方案稳定后修复旧链接。",
        "decisions": [],
        "files": [
          ".agent-workbench/rules/boundaries.md"
        ]
      }
    ],
    decisions:[
      {
        "status": "implemented",
        "category": "architecture",
        "date": "2026-11-02",
        "slug": "public-api",
        "title": "跨服务能力通过公开接口交接",
        "problem": "直连私有存储会形成隐式运行依赖。",
        "choice": "调用公开 API，正式接口与测试归提供方维护。",
        "consequence": "依赖关系更清楚；需要处理接口失败与兼容。",
        "alternatives": [
          {
            "title": "直接读取其他服务的私有表",
            "reason": "少一次网络请求，查询自由；私有迁移、授权和部署会影响调用方，因此通过稳定公开接口使用能力。"
          },
          {
            "title": "复制提供方内部实现",
            "reason": "调用路径短，局部可控；修复与权限逻辑开始分叉，因此正式实现与测试仍由提供方拥有。"
          }
        ],
        "links": [
          "shared-tables",
          "copied-contracts"
        ],
        "files": [
          ".agent-workbench/rules/boundaries.md"
        ]
      },
      {
        "status": "proposed",
        "category": "feature",
        "date": "2026-11-23",
        "slug": "request-id",
        "title": "为错误响应补充请求标识",
        "problem": "排查问题时难以关联调用方与服务日志。",
        "choice": "拟在可公开错误中返回 request_id，等待审核。",
        "consequence": "明确错误字段并补充契约测试后再落地。",
        "links": [
          "minimal-logs"
        ],
        "files": [
          ".agent-workbench/rules/api.md"
        ],
        "alternatives": [
          {
            "title": "返回完整堆栈有助排查",
            "reason": "返回完整堆栈有助排查，但可能暴露内部细节。"
          }
        ]
      },
      {
        "status": "rejected",
        "category": "architecture",
        "date": "2026-10-12",
        "slug": "shared-tables",
        "title": "直接读取其他服务私有表",
        "problem": "希望减少一次网络调用。",
        "choice": "拟允许查询服务直接读取另一服务的私有表，减少一次请求和数据转换。",
        "consequence": "短期保留调用成本，避免形成隐式依赖。",
        "rejectionReason": "私有表不承诺兼容接口，迁移与授权会形成隐式耦合；通过提供方公开接口处理跨服务交接。",
        "files": [
          ".agent-workbench/rules/boundaries.md"
        ],
        "alternatives": [
          {
            "title": "直连查询实现较短",
            "reason": "直连查询实现较短，但发布、权限和迁移高度耦合。"
          }
        ]
      },
      {
        "status": "archived",
        "category": "process",
        "date": "2026-09-22",
        "slug": "copied-contracts",
        "title": "调用方复制接口定义的旧做法",
        "problem": "早期缺少可复用的公开定义。",
        "choice": "当时手工复制定义，现已改为提供方统一维护。",
        "consequence": "仅留作迁移背景。",
        "files": [
          ".agent-workbench/rules/boundaries.md"
        ],
        "alternatives": [
          {
            "title": "复制启动快",
            "reason": "复制启动快，但后续容易漂移。"
          }
        ]
      },
      {
        "status": "implemented",
        "category": "bug-fix",
        "date": "2026-11-15",
        "slug": "idempotent-write",
        "title": "响应丢失后的写入重试只产生一个结果",
        "problem": "网络断开不能说明写入失败，简单重试会新增重复记录。",
        "choice": "调用方为一次操作提供稳定 key；服务端保存对应结果并核对载荷，重试复用结果，同键不同载荷返回冲突。",
        "alternatives": [
          {
            "title": "只按载荷文本永久去重",
            "reason": "不要求调用方改造；两个不同时间的真实操作可能文本相同，无法区分重试与新操作。"
          },
          {
            "title": "仅使用进程内缓存",
            "reason": "读写简单且快；重启后丢失去重依据，因此操作结果必须能持久核对。"
          }
        ],
        "consequence": "减少重复写入；需要处理部分失败、重启及同键冲突。",
        "links": [
          "timeout-check"
        ],
        "files": [
          ".agent-workbench/rules/reliability.md"
        ]
      },
      {
        "status": "implemented",
        "category": "process",
        "date": "2026-10-06",
        "slug": "timeout-check",
        "title": "超时后先核对服务端操作结果",
        "problem": "客户端等待超时与服务端任务结束是两件不同的事。",
        "choice": "查询操作状态再决定继续等待、复用结果或恢复重试；未知状态不伪报未执行。",
        "alternatives": [
          {
            "title": "超时即重发",
            "reason": "实现直接、能快速恢复未接收请求；服务端已完成时会重复副作用。"
          },
          {
            "title": "超时即当作成功",
            "reason": "避免重复提交；结果未知时会把失败掩盖为完成，因此明确显示可核对的未知状态。"
          }
        ],
        "consequence": "结果语义更准确；调用方需要稳定操作引用和恢复入口。",
        "links": [],
        "files": [
          ".agent-workbench/rules/reliability.md"
        ]
      },
      {
        "status": "implemented",
        "category": "testing",
        "date": "2026-10-21",
        "slug": "contract-checks",
        "title": "契约定义与测试由接口提供方维护",
        "problem": "多个仓库各自复制测试和定义，字段与错误语义逐渐漂移。",
        "choice": "正式请求、响应和错误契约归提供方，组合测试通过公开 API 核对交接而不依赖对方私有源码。",
        "alternatives": [
          {
            "title": "总仓库再维护完整接口副本",
            "reason": "查看方便，也能集中调试；需要同步两处正式定义，仍会漂移。"
          }
        ],
        "consequence": "接口归属清晰；真实交接仍需单独验证，结构检查不足以证明组合可用。",
        "links": [],
        "files": [
          ".agent-workbench/rules/testing.md"
        ]
      },
      {
        "status": "implemented",
        "category": "simplification",
        "date": "2026-11-24",
        "slug": "minimal-logs",
        "title": "排障日志不重复保存完整请求",
        "problem": "完整请求日志会把私人字段和长文本扩散到另一处存储。",
        "choice": "保留 request/operation 标识、错误类别和必要引用；输入正文不默认复制进排障日志。",
        "alternatives": [
          {
            "title": "完整记录所有请求便于复现",
            "reason": "信息最全，排障直观；保存范围过大且增加清理负担，需要时通过显式隔离夹具复现。"
          }
        ],
        "consequence": "减少重复数据和隐私范围；部分问题需要用户提供最小复现输入。",
        "links": [],
        "files": [
          ".agent-workbench/rules/operations.md"
        ]
      }
    ],
  },
];

export const demoGlobalRules = '# 全局偏好\n\n> 演示内容，不代表其他真实项目的有效规则。\n\n## 沟通\n\n- 使用中文简洁沟通，先说明结果，再补充必要的验证与限制。\n- 遇到含糊条件时保留来源，不把推测写成已确认的事实。\n\n## 工作方式\n\n- 保留用户已有修改。\n- 优先保持脚手架轻量，按需读取约束。\n- 新约束先提交候选，审核准确差异后生效。\n\n## 留档\n\n重要修改记录原因、实际结果和验证，不复制完整对话。跨项目通用偏好单独审核，不自动从某个项目推广。\n';
