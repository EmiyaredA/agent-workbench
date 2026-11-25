## Python × PostgreSQL

- SQLAlchemy 异步引擎配套异步 PostgreSQL 驱动及连接配置；沿用项目既有驱动，不直接套用 SQLite 连接选项。
- 校验数据库生成值、约束错误与并发事务行为；采用此配置前核对相应驱动和迁移入口。
