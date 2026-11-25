## Go × SQLite

- GORM 配套 SQLite 驱动；统一初始化外键、锁等待与连接设置，在隔离库验证。采用此配置前核对实际驱动，不复制 PostgreSQL 的 bytea、timestamptz、advisory lock 或专有 SQL。
- 模型建表和存量变更分别验收；已有库变更同批提供 SQLite 可执行的迁移／恢复方案，不把 PostgreSQL 手工脚本直接用于 SQLite。
