# 平台构建准备

`sync-runtime.mjs` 从唯一手工配置的 Manifest 派生公开 AppID 与业务入口，生成 `src/config/runtime.ts`。不读取密钥；Manifest 改动后先运行 `pnpm check`，再执行 CLI 本地或云构建。
