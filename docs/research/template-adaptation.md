# 默认模板技术适配

核对日期：2026-11-26。此处是模板设计与来源说明，不是项目默认加载的规则。

## 两组内容依据

- 用户提供的 `go-zero-starter-main.zip`：SHA-256 `a60ceded39d481ce92856cabd97ff0af8c2a1894058aa2e5a64628ee0c62ed7d`。读取 README、Go/前端依赖、CLAUDE/AGENTS 及配置；没有运行初始化、同步或构建脚本。实际包含 TypeScript/Vue 3/Vite、Go/go-zero、PostgreSQL/GORM、Redis；文件规则要求经过 OSS 接口，未配置时不落盘回退。
- 工作台已登记的组合仓库、Core 与六个工坊：只读核对项目清单、入口、现行约束及 Core 存储说明。主要为 TypeScript/React、Python/FastAPI、SQLite/SQLAlchemy/aiosqlite，以及显式配置的本地存储。部分依赖清单同时出现 Vue 与 React，不能仅凭安装包把项目判成 Vue；需看真实入口，证据不明时不预选。

本轮按用户要求保留具体工程约束，合并重复表达而不只提炼通用建议。Agent 角色与浏览器工具依确认结果适配；新功能分支／worktree、分块自动提交、审核验收后再合入的流程保留为模板规则，推送／合并／发布仍需授权。业务审计等记录追加留存，隔离临时夹具按测试生命周期清理；当前工作台及已登记项目没有因此被自动导入模板。

## 组合与边界

一个参数化默认模板；工程约定、开发与实测流程、playbook 默认包含。按选项组合前端、后端、数据库、缓存及文件存储模块，并生成只链接实际模块的相对索引。无对应技术时不生成空模块。每个语言／数据库组合有独立适配段，111 种允许组合由自动测试枚举。

GORM 的 PostgreSQL 与 SQLite 驱动支持依据[官方连接说明](https://gorm.io/docs/connecting_to_the_database.html)。Python 的 PostgreSQL 异步适配依据 [SQLAlchemy PostgreSQL](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html)，SQLite 异步适配依据 [aiosqlite 方言](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#aiosqlite)。会话不跨并发任务共享的要求依据[异步会话说明](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#using-asyncsession-with-concurrent-tasks)。

Go × SQLite、Python × PostgreSQL 是依据这些驱动能力新增的约束适配，不代表参考项目已经采用或已经完成运行验收。模板不安装驱动、不修改 schema、不把存储配置改成选定方式；这些仍须具体项目实现与验收。

文件存储选择本地时，仅引入配置根目录、数据分离、缺失时报错与迁移完整性要求；选择 OSS 时才引入统一对象接口、访问边界和不隐式回退本地的要求。不声明具体厂商或未发现的 SDK 功能。

## 变更保护

模板导入仅形成草稿，与项目文件发生碰撞时展示原文／候选及处理按钮。再次组合以旧生成版本为基线，未改动片段自动更新，人工修改保留并提示冲突；未解决冲突不能保存。最终写入仍核对整套 baseHash、已预览内容及稳定操作标识，留下一条维护记录。个人模板保持独立文件快照，不扩展为可执行脚手架。


## 本轮来源逐项对照

[来源条目映射](scaffold-rule-map.xml)记录 9 份文档中的 384 个条目，含原位置、章节、摘要、指纹、目标规则或写作资源、条件与处置原因。目录和事实性提示也列在其中，因此条目数不等于独立规则数。机械检查确认目标文件存在、条目身份唯一、处置完整；它不能证明语义等价，语义须对照来源人工检查。

正文按主题组织为工程约定、开发与实测流程、playbook 和技术栈子目录；架构、系统设计提供可复制的写作参考，项目事实不足时不自动写成有效规则。需求、原型、迁移脚本与项目指南保持原目录，旧项目文件不自动改名。

外部缺口包括全局 Claude 配置、go-zero Skill 的 api/model 文档、未提供的 shared/cache 和可选审核／预筛／常驻测试数据脚本。相应要求标注前提，不留下依赖本机绝对路径的活动引用。参考源码中“所有错误 Errorf”与后文“业务拒绝 Infof”有重叠冲突，采用后文更具体的业务拒绝与系统错误分级；保留错误码稳定性测试，不把纯展示镜像测试扩写成硬性要求。

前端原本的 localStorage、固定组件名、客户端头和响应体结构作为参考布局条件，不强制替换现有项目的鉴权协议或组件体系；共享业务设置的测试改动需确认影响范围，不能照搬清空真实共享设置的步骤。
