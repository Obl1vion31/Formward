# Scripts

## 目的

本目录保存开发者或管理员主动运行的维护工具。

## 当前入口

- `prepare-turn-video.sh`：使用 FFmpeg 将 v6 原始一秒转身视频生成 960×1440、逐帧关键帧的播放文件，不覆盖原始视频。
- `check-structure.sh`：检查所有项目自有目录是否包含非空 README。
- `migrate.mts`：使用 DATABASE_MIGRATION_URL 或 DATABASE_URL 执行版本化 Drizzle migration。
- `create-account.mts`：交互式读取邮箱和隐藏密码，调用认证 feature 创建内部账号；重复执行保留原密码。

账号创建与数据库维护工具的用途见 [代码阅读指南](../docs/code-study.md)。脚本中的中文注释供需要查看实现细节时参考。

配置读取 `.env.local`，不把账号密码放在命令行参数、源码或公开文件中。账号创建和数据库接入步骤见 [接入指南](../docs/auth-setup.md)。后续导入预览和数据一致性检查也调用正式 feature，不复制业务规则。
