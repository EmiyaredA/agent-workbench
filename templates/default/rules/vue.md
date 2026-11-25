## Vue 3

- 沿用 Composition API 与已有 composable、store；异步任务、监听和订阅有清理，避免同一状态的多个副本。
- 若采用参考脚手架布局，API 按领域集中在 `src/api/`，主题由已有 store 切换；没有用户选择时可跟随系统，不复制另一套主题状态。
- 参考脚手架的 `BaseDialog.vue`、`lib/money.ts`、`lib/format.ts`、`lib/sanitize.ts` 与 i18n 客户端只有项目确实提供时才使用；缺少实现先确认适配，不能凭文档宣称存在。
- 参考接口客户端统一传身份、语言及已定义的客户端头，金额写入带幂等键，上传下载走统一入口。凭据存取遵循项目现有机制，若现有代码使用 localStorage，读写处理存储异常。
- `v-html` 输入必须清洗；采用双语词条时保持键结构一致，项目已有 Pinia 则继续使用同一 store。
