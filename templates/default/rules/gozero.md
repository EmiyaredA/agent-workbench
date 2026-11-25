## go-zero 与参考目录

- 依赖向下：handler → logic → service → models → domain；handler 解析协议，logic 做权限、校验与编排，models 管查询与事务。跨模型、外部调用或副作用由所属 service 承担，service 不返回 HTTP DTO。
- 使用参考布局时，中间件实现在 `shared/middleware`，服务内生成名字只做转接；专用辅助职责放 `internal/pkg/<用途>`，不在多个 logic 复制。已有 infra 能力先复用，缺少时确认，不假定外部包已经安装。
- 参考契约先改 `desc/*.api`，再用服务 Makefile 的 `make api` 生成；不用漏掉自定义 tpls 的裸 goctl 命令。`routes.go`、types、api.json 不手改，生成模板不合适则改模板。
- 采用参考路由约定时，所有路由块位于主 `desc/api.api`，领域文件只放类型；新增类型与路由追加，管理侧 prefix `/api/admin`／group `admin/<领域>`，其他 prefix `/api`，访问条件在块上说明。管理员接口同时经过身份与管理员校验。
- 生成不会自动删除废弃 handler／logic，删除接口同步处理孤立文件；模板变更需重建已有产物时保护手工 health 等定制内容，发现空响应先核对路由装配。既有手工路由块不顺手改路径、文案或中间件。
- 结构校验优先使用 `.api` tag，logic 保留业务校验。涉及金额的写接口带幂等键，同键不同内容返回 409；参考非 multipart 请求上限 1 MB、超限 413，目标项目按实际契约适配。签名不代替权限。
- 使用参考错误设施时，bizerr 编码为 HTTP 状态码×1000＋序号，仅追加；新错误同步常量、变量、两份 locale 与码表测试。logic 的统一错误转换记录原因一次：业务拒绝 Info，其他错误 Error 后转 Internal；响应写入携带 request。
- 请求日志与业务拒绝日志通过请求 ID 关联，handler 不重复记录；已有 commitlog 时事务成功日志在提交后输出，否则放到提交之后。幂等键仅记前八位等安全摘要。
- 采用参考 settings 结构时，config 只放监听／日志、数据库、Redis 和解密密钥环等启动项；其余业务设置由目录定义、管理端配置、保存与热重建。Secret 字段加密，只暴露已设置状态；参考 secret_hint 仅在明文至少 16 字符时给出末 4 字符，完整明文与密文均不回传；pepper 等 Immutable 字段首次生成后不可随意改动。
- 参考 RestConf 的中间件／Stat 配置原文依赖未随包提供的外部 Skill；不得猜写四项名称或擅自覆盖框架配置，按真实接口文档确认后落地。
- 预检使用现有增量入口，或 gofmt、go build、go vet 和受影响包 go test；前端嵌入 dist 时先有有效构建产物。使用已有 goctl validate 与 make api 核对契约；参考“暂不支持 map 类型”提示不等于生成失败，结合实际退出码和产物判断。
