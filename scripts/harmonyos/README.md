# 鸿蒙构建与检查

Windows PowerShell 运行 sync-build.ps1，将主仓库客户端同步到既有 DevEco 工作目录并调用已安装的官方工具链。仅同步声明的源码类型，排除签名、IDE 设置、依赖、缓存和 README，保留 Windows 本机资料。原始基础工程已私有归档。

同步前必须在主仓库完成源码审核。发布签名通过 DevEco／华为控制台配置，不写入本脚本或命令行参数。产物不进入 Git。隔离测试与正式应用的包名、名称和入口必须明确区分。

prepare-workspace.mjs 使用已安装的官方 DevEco JSON5 解析器，在 Windows 工作区合并保留原有签名配置。可选 build-profile.local.json5 仅存本机，内容不输出日志。WSL UNC 脚本受本机执行策略限制时，将脚本复制到本机临时目录后通过 Repository 参数指定主仓库，无需修改执行策略。

本机隔离构建仅允许 debug 和名为 FormwardHarmonyFixture 的独立目录；通过 FORMWARD_HARMONY_FIXTURE_URL 指定回环地址，自动使用独立包名和可见测试标识。正式构建不设置此变量。host-policy.test.mjs 验证可信来源、导出路径与消息桥边界，运行 node --test scripts/harmonyos/host-policy.test.mjs。应用当前状态见 ../../docs/harmonyos-release.md。
