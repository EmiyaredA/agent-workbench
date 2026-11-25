## Go × PostgreSQL

- 使用 PostgreSQL 对应驱动和现有连接池；参考模型 bytea 用 []byte、时间用 timestamptz，状态列用 domain 类型，明确创建／更新／软删字段。
- 手工测试插入提供 created_at、updated_at，不能靠查询的 NULLS LAST 掩盖错误数据。参考模型不采用部分唯一索引，全表唯一约束与并发条件检查分工明确。
- AutoMigrate 未覆盖的 CHECK、触发器和种子数据由幂等 schema 守卫补齐；多实例建表锁、结构指纹与强制迁移仅在项目需要且具备实现时采用，不能宣称模板已提供。
- 数据库并发、约束错误、回填与恢复在隔离 PostgreSQL 验证，不套用 SQLite 的锁或 SQL 行为。
