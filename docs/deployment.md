# 公网 HTTPS 部署

## 当前正式版本

网页与聊天 worker 运行同版 `dual-entry-ed1b5c59-chat-stop-recovery-20261123`，源码 `ed1b5c591ab2be756e0310b802400b9d7538ef68`，BUILD_ID `ZSxvap30StWqzjyRX8NAJ`。北京时间 2026-11-23 22:13:41 切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

小助手停止指向当前会话和具体运行。接收确认前暂存停止意图，结束快照到达收起停止按钮。「重新读取对话」直接读取本会话，读取失败可重试。正文分片协商使用独立于回源鉴权的请求头，保留静默保活。Chromium 桌面与 WebKit 手机视口从准确包解包验收。 [实际网页验收](../design-qa.md)

数据库仍为 `0047_meal_food_groups`、47项迁移、67张表。停写备份完成原生校验与异地回读，配置摘要保持。四个域名同版，新旧网页资源和接口权限已核对；兼容56项 Server Action 和2374项旧静态资源。准确包 87,938,210 字节，SHA-256 `3f285d98df89342ee0af80a6dbe864f72b1cde60af836cc9ba55bebed6874bf0`。源码、归档和验证保存在 `.codex/backups/regional-releases/chat-stop-recovery-20261123`，兼容回退为 `review-recovery-r2-20261123`。

## 小助手确认与保存恢复发布记录

该次网页与聊天 worker 版本为 `dual-entry-732cde89-review-recovery-r2-20261123`，源码 `732cde89b42fb245856be0689c9a41e4f107a455`，BUILD_ID `bEJaz_wHU7mzKsvAinbO6`。北京时间 2026-11-23 20:14:02 切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

小助手与完整确认页已移除「提交信息」折叠项。旧版在原位更新，失联后读回本次保存状态。无关饮食或食材变动继续安全保存，关联变化需更新或查看当前正式餐次。Chromium 桌面和 WebKit 手机视口从准确归档解包运行，858项单元与集成通过，2项原有跳过。 [实际页面验收](../design-qa.md)

停写备份完成原生校验与异地回读，67张表及配置摘要一致。数据库仍为 `0047_meal_food_groups`，保留47项迁移。四个公网域名返回同版，新旧静态资源及匿名接口权限已检查，沿用既有国际网关。保留56项 Server Action、原绑定密钥及2368项旧静态资源。

准确运行包大小 87,797,371 字节，SHA-256 `79c8f19978425f148924494af197405b112f69a8626c87393150e549a2701d6b`。源码、运行包及验收记录在 `.codex/backups/regional-releases/review-recovery-r2-20261123`。兼容回退为 `harmony-cloud-fixes-r3-20261121`，沿用现有数据库。

## 鸿蒙选图取消与原图恢复发布记录

该次发布版本为 `dual-entry-d7c401eb-harmony-cloud-fixes-r3-20261121`，源码 `d7c401ebd9bf46616e17ff0a70bf29b0f7880e77`，BUILD_ID `JF9gGvY_KRVSLV16P9jo5`。北京时间2026-11-21 23:42:16切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

选图取消只处理文件选择，不再冒泡为关闭助手或录入面板。上传以原始文件头识别MIME、保留原字节及摘要；人工换通道后重试保留所选通道，同一File和通道在10分钟内复用已签发票据，避免重复预占上传名额。成功、会话拒绝和票据冲突会清除缓存，服务端归属、签名有效期及额度校验保持。模型与存储回放只用于隔离验收。

AI回答及复制标识、含已确认AI来源的Excel可见提示和OOXML七字段标识继续共用网站主线。隐私政策覆盖助手历史、千问与小米、手机照片与缓存、导出来源；服务条款与公开隐私正文在本次发布后均与main逐字节一致。鸿蒙构建2和商店材料状态见[鸿蒙首发](harmonyos-release.md)。

lint、typecheck、production build和全量测试通过：858项中856通过、2项原有跳过、0失败。14项原图上传专项覆盖格式误报、快照失效、通道切换、重试票据复用、过期与会话拒绝。准确兼容包以临时PostgreSQL和虚构账号实际完成电脑及390×844手机的系统选择器取消、草稿保留、聊天与餐次的国内备用上传及原图登记；连续操作未再提前触发并发名额。随后同一原始签名构建2／API24云真机已完成真实照片上传、取消图库保留编辑页、千问虚构消耗预览确认保存与记录读回、生成后台恢复；这些结果与隔离回放分别保存。相机入口和系统跳转已验证，本人确认云端隐私保护提示并结束重复相机复测；未取得拍摄图片字节，保留云端限制说明，不据此修改原生代码。完整人工流程尚未全部复验。

停写切换前后67张表及配置摘要一致，结构仍为`0047_meal_food_groups`、47项迁移。备份`formward-primary-20261121T154212353784Z.dump.json`完成原生校验和加密异地回读。网页与worker已同版，四个现有入口均返回新版；隐私与条款200，匿名导出401并禁止缓存。海外入口沿用既有iad1网关。

保留56项Server Action、原绑定密钥及2360项旧静态资源。服务器暂存目录逐文件核对，通过新旧运行包启动门禁；本机用同一新构建和已校验的旧正式资源重建规范归档，其87,664,917字节与SHA-256 `1a1df2c26d2b62751b1b9c7da2460eb8a7f0e77dd3c565529382c0152570130f`与服务器准确归档完全相同，再从该归档解包验收。源码、准确运行包、发布证明及验收保存在`.codex/backups/regional-releases/harmony-cloud-fixes-r3-20261121`；兼容回退为`harmonyos-materials-20261121`，不回滚数据库。商店尚未提交审核或上架。

## 手机工作区与聊天胶囊发布记录

手机工作区与聊天胶囊运行在 `dual-entry-53c6ee57-mobile-workspace-centering-20261121`，源码 `53c6ee574047ee1864f9ca289753497e834b2fde`，BUILD_ID `u0oKTX33lJPR99OhNCNuz`。北京时间 2026-11-21 02:40:59 切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

手机顶栏、正文和底栏共用屏幕中线。食材库在可用宽度 348 CSS px 起继续右挂，较窄时与日期、查看记录同排。聊天／待办选中底片四边各留 3 CSS px。Chromium 和 WebKit 完成本地 60 个页面与视口组合、24 个慢加载场景及正式兼容包 40 个页面组合。实体 iPhone Safari 单列待测。 [视觉验收](../design-qa.md) · [设计规范](design-reference.md#跨端控件材质与反馈)

上海网页和聊天 worker 运行同版。数据库维持 `0047_meal_food_groups`、47 项迁移及 67 张表。切换前后配置和表摘要一致，停写备份完成 PostgreSQL 原生校验和加密异地回读。四个公网域名及兼容 IP 返回同版，登录返回、匿名权限和原海外网关回源通过。核对 20 项公网静态资源。

保留 56 项 Server Action 编号和原绑定密钥，携带 2341 项旧静态资源。正式包 SHA-256 `6c7b0521912e391e96b766ae6d690746ba886e0dfd34146445b1db86b63189c6`，大小 87,359,714 字节。本机归档为 `.codex/backups/regional-releases/mobile-workspace-centering-20261121`，兼容回退为 `edge-controls-20261121`。

## 食材库挂签与小助手开合发布记录

食材库挂签、记录操作与小助手菜单运行在 `dual-entry-491149a0-edge-controls-20261121`，源码 `491149a0abf12b34fcceb1f4b6776a172ee37164`，BUILD_ID `1LmdZmCrX-vOu6t_F1-Mw`。北京时间 2026-11-21 01:39:40 切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

手机食材库采用右侧挂签，电脑入口在左导航下方。打开食材库再返回保留饮食历史状态。饮食、消耗与身体的记录使用统一单层操作，账号及模型菜单沿触发点开合，输入栏的加号和模型选择平时只显示图标或文字。 正式兼容包完成 Chromium 与 WebKit 的 5 组手机／桌面实际页面核对。桌面 WebKit 的模型菜单核对了起止位置，连续帧采样不足。实体 iPhone Safari 待真机确认。 [视觉验收](../design-qa.md) · [跨端控件规则](design-reference.md#跨端控件材质与反馈)

上海网页和聊天 worker 运行同版。数据库维持 `0047_meal_food_groups`、47 项迁移及 67 张表。切换前后配置与表摘要一致。停写备份 `formward-primary-20261120T173936736747Z.dump.json` 完成 PostgreSQL 原生校验和加密异地回读。四个公网域名和兼容 IP 版本一致，核对登录返回、匿名权限、20 项静态资源及原海外网关回源。

保留 56 项表单操作编号和原绑定密钥，并携带 2329 项旧静态资源。正式兼容包 SHA-256 `ce62357e4719a82c1f425fb2fa0a9fbc27bf3a8d3407e7844258df24f18ab1b0`，大小 87,175,395 字节。归档于 `.codex/backups/regional-releases/edge-controls-20261121`，兼容回退为 `mobile-glass-controls-20261120`。

## 手机轻玻璃与历史查询发布记录

手机轻玻璃、滑动胶囊与一行历史查询运行在 `dual-entry-5baaaf21-mobile-glass-controls-20261120`，源码 `5baaaf2169b7db32607badfeb12c79a310fc2d3c`，BUILD_ID `2w4Lgp0sTASOhHWGIEo_-`。北京时间 2026-11-20 23:57:19 切换。 [正式站](https://formward.top) · [正式版本](https://formward.top/api/app-version)

手机独立按钮共用单一可见面，主导航、聊天／待办、晨晚与消耗分段支持跟手与吸附。身体、饮食和消耗的历史日期查询同排。电脑左栏使用纵向选中底片。正式兼容包完成两引擎八个手机／桌面场景、60 次按压和三页原生日期字段查询。已测按钮与胶囊外框最大偏差 0 CSS px。实体 iPhone Safari 待用户在线验收。 [视觉验收](../design-qa.md) · [跨端控件规则](design-reference.md#跨端控件材质与反馈)

上海网页与聊天 worker 运行同版。数据库维持 `0047_meal_food_groups`、47 项迁移及 67 张表，切换前后配置和表摘要一致。停写备份 `formward-primary-20261120T155715709288Z.dump.json` 完成 PostgreSQL 原生校验与加密异地回读。四个公网域名和兼容 IP 版本一致，另核对登录返回、权限、20 项静态资源及海外网关回源。

保留 56 项表单操作编号、原绑定密钥和 2308 项既有静态资源。正式包 SHA-256 `184e0cbaa4bbb1f02adc13c630290270acf7519cda47d976f025087a7097bc02`，大小 86,822,262 字节，归档在 `.codex/backups/regional-releases/mobile-glass-controls-20261120`。兼容回退为 `desktop-chart-loading-r5-20261120`。

## 桌面图表等待发布记录

桌面图表等待运行 `dual-entry-9d4292c6-desktop-chart-loading-r5-20261120`，源码 `9d4292c63adba59ce83e0835d00795a443fadcdf`，BUILD_ID `ZLyNV1ZBsKmY_ALIVci6a`。北京时间 2026-11-20 21:51:02 切换。 [正式消耗页](https://formward.top/dashboard/energy) · [正式版本](https://formward.top/api/app-version)

在手机输入修复的正式源码上叠加图表改动。桌面总览、饮食、消耗和身体等待时沿用手机的细线骨架。正式兼容包在 Chromium、WebKit 的桌面和手机视口完成 154 项实页检查。图框四边最大偏差 1.00 CSS px。 [视觉验收](../design-qa.md)

上海网页和聊天 worker 同版，数据库沿用 `0047_meal_food_groups` 和 47 项迁移。切换前后 67 张表及运行配置摘要一致。停写备份 `formward-primary-20261120T135058456815Z.dump.json` 通过 PostgreSQL 原生校验和加密异地回读。已核对 4 个公网域名及兼容 IP、跳转、登录返回、16 项静态资源核对与匿名权限。

保留 56 项现行 Server Action 编号和原绑定密钥，兼容 2290 项既有静态资源。正式兼容包 SHA-256 `814f5e465cdc477da1b65384638efd9e31ad9c91566aa3d3bcac4c3ed3112a96`，大小 86,493,950 字节，归档于 `.codex/backups/regional-releases/desktop-chart-loading-r5-20261120`。兼容回退为 `mobile-input-r3-20261120`。

## 手机输入修复发布记录

手机输入修复运行 `dual-entry-10f74b9b-mobile-input-r3-20261120`，源码 `10f74b9b3540293263723db958462f53c78d4701`，BUILD_ID `yF0mm2nQp9IRym6Nf7Rrk`。北京时间 2026-11-20 21:23:51 切换。 [正式版本](https://formward.top/api/app-version) · [验收图册](<C:/Users/14878/.codex/visualizations/2026/11/18/01a1ee4f-83a7-74a1-b58d-000090938d80/formward-mobile-input-viewport/index.html>)

手机身体录入的标题固定，来源建议留在输入控件旁，保存按钮在键盘开合两种状态分别留出 12／16 CSS px。消耗、饮食、训练、审核、资料和设备录入按实际可用区域显示焦点。小助手在 WebKit 键盘开启时可直接点按发送。两引擎验证实际发送、草稿和图片保留，iPhone 真机未测。

上海网页与聊天 worker 同版。沿用数据库结构 `0047_meal_food_groups` 和 47 项迁移。正式切换期间 67 张表及运行配置摘要一致，备份 `formward-primary-20261120T132346818461Z.dump.json` 通过 PostgreSQL 原生校验及异地回读。四个公网域名及兼容 IP 已核对版本、跳转、登录返回、静态资源和匿名保护。海外网关的 API 1.15.1 及 MCP 发现通过核对。

保留 56 项现行 Server Action 编号、原绑定密钥及 2277 项既有静态资源。兼容包 SHA-256 `d96f9a538e210f884ae35bb13a456bfef6f1f6bbf63eae30ea669b90bb1f4c88`，86,343,202 字节，归档在 `.codex/backups/regional-releases/mobile-input-r3-20261120`。兼容回退版本为 `measurement-mobile-save-20261120`。

## 手机测量录入发布记录

测量页运行 `dual-entry-9538d161-measurement-mobile-save-20261120`，源码 `9538d161f866b7f24edcedb8fefdc37376f2ee90`，BUILD_ID `t7EL1S0Z_cYnN77roDCkS`。北京时间 2026-11-20 20:36:00 切换。 [正式测量页](https://formward.top/dashboard/measurements) · [正式版本](https://formward.top/api/app-version)

手机晨晚胶囊按文字收窄，保存占满整行，与体重及来源对齐。电脑录入的晨间、晚间各占通栏，记录来源在图标旁悬停显示。同一正式兼容包在 Chromium 和 WebKit 各通过 6 组实页验收，覆盖切换、草稿、保存失败、重试落库和返回。 [正式运行包的隔离实页截图](<C:/Users/14878/.codex/visualizations/2026/11/18/01a1ee4f-83a7-74a1-b58d-000090938d80/formward-measurement-mobile-save-release/index.html>)

上海网页与聊天 worker 同版。结构沿用 `0047_meal_food_groups` 和 47 项迁移，切换期间 67 张表与运行配置摘要一致。备份 `formward-primary-20261120T123556641683Z.dump.json` 通过 PostgreSQL 原生校验及加密异地回读。四个域名和兼容 IP 版本一致，核对了 HTTPS 跳转、原登录返回、新旧静态资源与匿名访问保护。原海外网关通过协议 1.15.1 和 MCP 发现核对。

保留 56 项现行 Server Action 编号、原绑定密钥及 2263 项既有静态资源。兼容包 `db42f4cfeaaa8eba67182bd9a9e3399d902739364efd05a99c0e4f68a98b772c`，86,055,427 字节，归档在 `.codex/backups/regional-releases/measurement-mobile-save-20261120`。兼容回退为 `assistant-keyboard-native-pan-20261120`。

## 小助手键盘外壳位移发布记录

上一正式版本为 `dual-entry-1f9920c8-assistant-keyboard-native-pan-20261120`，源码 `1f9920c88a9283a58b71f103e5703c3674a1938d`，BUILD_ID `57YqeoofnHoR_qgJolQL0`。北京时间 2026-11-20 20:24:40 切换。 [公网小助手](https://formward.top/dashboard/assistant) · [正式版本](https://formward.top/api/app-version)

小助手根据可见区域收缩聊天空间。键盘出现后若外壳实际移出屏幕顶边，按测得的外壳边界补偿。输入区柔光已移除，确认保存按钮沿用原实现。正式包在 Chromium 与 WebKit 各通过 12 轮外壳 −338 CSS px 位移及恢复，按用户要求上线供 iPhone 系统键盘直接测试。 [视觉验收](../design-qa.md)

上海网页和聊天 worker 同版。生产数据库使用 `0047_meal_food_groups` 和既有 47 项迁移，切换前后 67 张表摘要和运行配置一致。停写备份 `formward-primary-20261120T122436096728Z.dump.json` 通过 PostgreSQL 原生校验和加密异地回读。保留 56 项 Server Action 及绑定密钥，追加 2254 项兼容静态资源。

本机和服务器兼容归档逐文件核对一致，SHA-256 `3e5813385d5d0ac6a624e35ebc2489d721be9314f94e8bd1b356f98351ea0073`，大小 85,965,084 字节。运行包位于 `.codex/backups/regional-releases/assistant-keyboard-native-pan-20261120`。兼容回退为 `meal-entry-public-20261120`。

## 记录一餐发布记录

正式站运行 `dual-entry-c990c6fb-meal-entry-public-20261120`，源码 `c990c6fb740071b41ca7dbafd74b5495a3e1c4f9`，BUILD_ID `uomWTu1xO4bag_4Wc-3Hk`。北京时间 2026-11-20 19:42:55 首次上线，19:54:19 由小助手键盘候选回切至此。回切后网页与聊天 worker 均运行该包，四个公网域名和兼容 IP 返回同一版本。生产继续使用原数据库及 `0047_meal_food_groups`，迁移账本仍为 47 项，保留「记录一餐」及已保存数据。 [记录一餐](https://formward.top/dashboard/meals?entry=1) · [正式版本](https://formward.top/api/app-version)

同一正式运行包在 Chromium 和 WebKit 各通过 11 组实页验收。手机检查窄屏单位、四项营养和依据同行、食材库选取与返回。桌面检查数量、单位及四项营养同列，双端均走完整保存。 [视觉验收](../design-qa.md)

上海网页与聊天 worker 同版。生产 schema 为 `0047_meal_food_groups`，含 47 项迁移。停写备份 `formward-primary-20261120T114247606603Z.dump.json` 已通过原生校验和加密异地回读。迁移只新增可空食材分类与约束，核对 67 张既有表的原字段及值。上一正式版 `measurement-record-row-r2-20261120` 已在新结构通过私有就绪检查。

已核对四个公网域名、兼容 IP、HTTPS 跳转、登录返回、新旧资源、匿名访问权限和海外发现接口。Vercel 网关两别名仍指向既有 iad1 部署。保留 56 项 Server Action 编号及绑定密钥，携带 2245 项旧静态资源。

兼容运行包归档在 `.codex/backups/regional-releases/meal-entry-public-20261120`，大小 85,757,690 字节，SHA-256 `a8289d576830ffd4fdbff194253dcc1f359a57610eb739c2c364c6561b6963ad`。正式构建沿用测量页发布和此前已回切的小助手输入行为，餐次源码已合入 main。

## 小助手键盘候选已撤回

`dual-entry-b6a7307b-assistant-keyboard-viewport-20261120` 于北京时间 19:48:34 切换。其布局在实体 iPhone 的隔离验收中连续六次复现打开系统键盘后输入框被裁切的问题。19:54:19 已回切正式网页及聊天 worker。 [实机验收](assistant-chat-verification.md#手机键盘调整与输入区)

该次切换使用的停写备份 `formward-primary-20261120T114830353472Z.dump.json` 已通过 PostgreSQL 原生校验及加密异地回读。原切换前后 67 张表摘要及运行配置一致。候选保留 56 项 Server Action 编号和绑定密钥，追加 2254 项兼容静态资源。

撤回包和回退证据归档在 `.codex/backups/regional-releases/assistant-keyboard-viewport-20261120`。运行包大小 85,966,910 字节，SHA-256 `8786386902f6d89494f5202a646cf4e2780efe1e1dcab43bceff4caa930e19ec`。

## 测量页单行发布记录

测量页运行 `dual-entry-ed2050bc-measurement-record-row-r2-20261120`，源码 `ed2050bcef4c6bc65252265c39430f594b08666f`，BUILD_ID `dvQ5q44_ulEyGqU80z18o`。北京时间 2026-11-20 19:18:53 切换。 [正式测量页](https://formward.top/dashboard/measurements) · [正式版本](https://formward.top/api/app-version)

电脑最近和历史记录每日期一行，鼠标悬停 ⓘ 显示来源小浮层。手机使用两行记录和点按来源。测量录入及编辑使用细底线。两引擎从同一兼容运行包复验编辑、保存、返回和浮层，正式站登录态复核当天及历史五行和 308 CSS px 浮层。 [视觉验收](../design-qa.md)

上海网页和聊天 worker 同版。生产 schema 为 `0046_assistant_conversation_removal`，含 46 项迁移。停写备份 `formward-primary-20261120T111849446303Z.dump.json` 通过原生校验及加密异地回读。67 张表和运行配置摘要前后相同。

四个公网域名及兼容 IP 版本一致，测量页登录返回、新旧静态资源和匿名权限核对通过。保留 56 项 Server Action 和绑定密钥，携带 2235 项旧静态资源。

运行包归档在 `.codex/backups/regional-releases/measurement-record-row-r2-20261120`，大小 85,586,656 字节。SHA-256 `f0bdfe83de024b542ffbda12ddaa4849abd63bc7aad91ace321902c42b56d601`。兼容回退为 `assistant-viewport-boundaries-20261120`。正式构建基于已回切并验过的版本，测量提交已合入 main。

## 兼容基线及小助手回切记录

测量页发布采用的兼容基线为 `dual-entry-b11ef297-assistant-viewport-boundaries-20261120`，源码 `b11ef29717904582f01249d9a974734f0b311778`，BUILD_ID `xjiGCw4Sf_o8_dCP8p-Qp`。北京时间 2026-11-20 19:00:51 回切。 [正式版本](https://formward.top/api/app-version)

18:54:18 发布的 `dual-entry-d629d3bc-assistant-composer-safari-20261120` 在实体 iPhone 键盘打开后把助手内容推到键盘后方。已回切网页和聊天 worker，生产 schema 保持 `0046_assistant_conversation_removal`。原运行包、上线及回切记录保存在私有发布归档。 [问题与验收](assistant-chat-verification.md#手机键盘视口回归与回切)

小助手的模型菜单从当前按钮上方 8 CSS px 展开。手机输入区按起手位置处理手势，助手进出使用固定视口。Chromium 与 WebKit 复验同一正式运行包，iPhone Safari 的系统键盘待实机确认。 [视觉验收](../design-qa.md)

上海网页与聊天 worker 运行同一构建。生产 schema 为 `0046_assistant_conversation_removal`，含 46 项迁移。切换前备份 `formward-primary-20261120T100851184898Z.dump.json` 通过 PostgreSQL 原生校验和加密异地回读。切换前后 67 张表摘要与运行配置一致。

四个公网域名和兼容 IP 返回同一版本。核对小助手原登录返回路径、新旧静态资源的内容摘要、匿名权限与海外 MCP 发现。保留 56 项 Server Action 编号和绑定密钥，兼容 2222 项旧静态资源。Vercel 的 iad1 网关沿用既有部署，两别名和回源已核对。

兼容运行包归档到 `.codex/backups/regional-releases/assistant-viewport-boundaries-20261120`，大小 85,435,865 字节，SHA-256 `b7fc5ffb21533982faeb8a22ca8576a91d312a685de6eff8400061920a2533b1`。兼容回退为 `remove-record-guidance-20261120`。

## 迁移与发布

先核对最新main、实际公网和其他未提交任务。运行lint、typecheck、真实测试文件清单、production build及受影响浏览器全过程；不能以最终截图、DOM存在或误展开4个文件代替。隔离PostgreSQL和虚构账号不连接正式库，不自动调用收费模型。

结构仅由版本化Drizzle migration演进，已发布迁移不修改；新迁移先备份、加密异机回读、隔离恢复排演和旧值／重复检查。构建不自动迁移。当前 schema0047 和 47 项迁移账本。0047 只加可空的食材分组字段和约束，旧行保留原值。恢复时先停 worker，再切已经在当前正式结构下通过就绪检查的兼容应用和 worker。

先保存本机永久运行包并验摘要，保留原绑定密钥及旧静态资源，当前Server Action使用新门禁，旧动作提示刷新，验收后，先以服务账号核对新目录可进入、文件可读取，并在私有端口启动正式配置完成readiness；顶级目录权限不得因私有umask变为0700。通过后才原子切应用指针；核对readiness、源码／schema／数据库及正式版本、健康和凭据摘要。失败只回切兼容应用，不恢复旧库或删数据。Vercel专用网关沿用下方归档工具与明确别名范围；Git推送不自动发布，不用根Next产物当网关，不以项目级promote接管其他别名。无网关改动时核对既有READY绑定和实际回源即可。

## 正式运行包归档与旧部署清理

GitHub 保存源码历史，本机永久保存每次正式发布的运行包；Vercel 保留最近三个成功 Production 版本、最近三个部署，以及域名绑定、当前目标、回滚目标和本机最近观察到的两个正式版本。实际保留数量可能超过三个。旧预览地址随部署删除失效；应用包不等于真实数据或密钥备份。

统一工具为 `scripts/vercel-releases.py`（Python 3，Linux／WSL，无新增 Python 依赖）。两个仓库的工具和专用测试保持相同实现。先激活既有 Node 环境；CLI 不在 PATH 时用 `VERCEL_CLI` 指向现有可执行文件，不另行全局安装。工具核对当前仓库和项目，只操作指定项目；所有动作默认预检，写入使用显式 `--apply`。

```bash
python3 scripts/vercel-releases.py inspect --project formward
python3 scripts/vercel-releases.py archive --project formward --deployment dpl_ID --apply
python3 scripts/vercel-releases.py verify --project formward --deployment dpl_ID
python3 scripts/vercel-releases.py publish --project formward --deployment dpl_ID --apply
python3 scripts/vercel-releases.py cleanup --project formward --limit 20 --apply
python3 scripts/vercel-releases.py policy --project formward --apply
```

正式发布顺序为：沿用本项目现有构建生成不接正式域名的 READY 候选 → 完成对应功能验收 → 通过 `publish` 归档原始产物、切换版本、只读核对并清理。不能绕过归档直接切正式域名；本工具不替代候选功能验收、不重新构建，也不调整应用或数据库配置。

归档按项目和部署 ID 区分，包含压缩的原始运行目录、源码快照、依赖锁、运行时、文件摘要和配置键的 ID／更新时间。部署元数据与包内 SOURCE_COMMIT 不同时保留两个源码快照，不声称 Git 提交等同于当时可能有未提交内容的构建。已有包校验通过后复用；损坏、下载失败、空间不足或配置缺失均停止发布与清理，不覆盖旧包。SHA256SUMS 支持独立校验；恢复时仍须核对数据库版本和另存的密钥。

清理先核对所有正在使用的域名均有完整本机归档，再检查正式服务；每次最多二十个，每个删除前重新核对发布清单和域名。发布变化、构建进行中、接口错误或检查失败即停止，不自动修改域名或回滚。每批私有日志保留具体删除 ID 和前后检查结果。七天自动保留策略仅为补充，平台例外仍可能保留更多部署。

本机运行包不自动删除。云盘由用户处理；电脑／WSL 损坏的风险仍存在，但不作为删除无用旧部署的前置条件。秘密单独私有保存，不进入 Git、公开日志或归档元数据；本次不追溯下载所有更早的运行包。

归档位于 Git 公共目录所属工作区的 `.codex/backups/vercel-releases/formward/`，不随临时 worktree 删除。国际候选继续使用现有双区工具并显式部署到 iad1；`publish` 只更新原国际正式版本承担的别名，保留仍指向其他部署的项目域名，不用项目级 promote 接管它们。既有上海服务、数据库、issuer／resource、Server Action 兼容与回退流程不变。网关归档中的协议和 schema 摘要仍须与上海服务核对；本工具不把 Vercel 网关包当成上海全服务备份。受 Vercel 登录保护的旧项目域名只核对绑定和保护入口，不声称完成应用功能验收。


## 平台与变量

上海业务使用 Node.js 24 和 PostgreSQL 18。Vercel 项目 `formward` 使用专用国际 Build Output 产物，发布区域显式指定 `iad1`；不能用根目录完整 Next.js 构建替代网关产物。`ENABLE_EXPERIMENTAL_COREPACK=1` 使用 package.json 的 pnpm 9.15.9，安装继续使用 frozen-lockfile。正式运行包归档和发布入口见本文开头，双区构建见[国服与海外后台](mainland-deployment.md)。

通过 CLI 手动发布，没有 Git 自动部署；Git 推送不会更新正式网站。Standard Protection 保护 Preview 和单次部署地址，正式别名公开。项目关联信息在被忽略的 `.vercel/`。

当前正式变量按运行位置分配：

| 变量 | 上海业务／维护 | Vercel 海外网关 |
| --- | --- | --- |
| DATABASE_URL | 仅回环连接 formward_primary，应用运行身份 | 不配置 |
| DATABASE_MIGRATION_URL | 仅维护进程使用独立管理身份 | 不配置 |
| BETTER_AUTH_SECRET | 保留原认证 secret，只在上海读取 | 不配置 |
| BETTER_AUTH_URL | https://formward-ten.vercel.app，保留原 issuer／resource | 相同公开入口 |
| FORMWARD_GATEWAY_SECRET／FORMWARD_IMAGE_SECRET | 私有共享的服务证明和图片能力配置 | 对应独立敏感变量 |
| FORMWARD_ORIGIN_URL／区域入口 | 已验证的回源和国服入口 | 同一套已验证入口，实际函数区域 iad1 |
| FORMWARD_TIMEZONE | Asia/Shanghai | Asia/Shanghai |
| ENABLE_EXPERIMENTAL_COREPACK | 构建时按既有流程设置 | 1 |
| BLOB_STORE_ID | 按海外图片职责调用网关 | Private Blob 自动关联，SDK 使用部署 OIDC |
| BLOB_WEBHOOK_PUBLIC_KEY | 当前预签名流程不依赖 webhook | 平台自动维护 |

真实数据库与存储不连接 Preview，不使用 NEXT_PUBLIC_ 变量保存秘密。本机 `.env.local` 仅连接隔离开发库，不再保留 Neon 连接；示例见[账号接入](auth-setup.md)。国际项目不配置 DATABASE／POSTGRES／NEON 连接或认证签名 secret；变量变化后重新部署。确认链接和 OpenAPI 使用 BETTER_AUTH_URL，忽略代理内部地址和请求 Host。默认时区使用 FORMWARD_TIMEZONE，HTTP 请求 X-Formward-Timezone 优先，按发生时的夏令时计算偏移。


## 私有原图

聊天／饮食共用一次读取的原图，JPEG／PNG／WebP，20MiB、最多8张；不缩放重编码。每批探测受控国内／国际通道，手动仅覆盖本批，历史照片不搬迁。国内COS限定精确来源，海外使用官方预签名一次PUT；Private Blob只关联Production，不改Public，不发静态凭据。

票据15分钟，传输总期限10分钟／连续60秒无新增字节停滞；100%后complete核对登记。取消、失败保留草稿，换路由用户明确点击，不静默重传。国内同源备用走回环3201及660秒；普通业务3200和代理120秒保持，20MiB大图不进旧4MiB入口。外部下载规则不与网页传输期限混用。

原图读取校验会话与归属，private/no-store。诊断只记阶段、通道、耗时、字节和受限错误，不记照片、文件名、签名或凭据。真实存储、备用、浏览器回放和真机分别记录；具体见[饮食](meals.md)及[助手验收](assistant-chat-verification.md)。

## 验收与维护

公开检查首页、HTTPS跳转、OpenAPI、OAuth／MCP resource、匿名拒绝及实际版本；真实登录会话只读核对。报告和上传原图私有，模拟、回放、存储实传及物理设备分开记。应用包不等同数据库／密钥备份，保留兼容回退。账号安全与权限见[账号接入](auth-setup.md)，当前检查及边界见[实现状态](status.md)。
