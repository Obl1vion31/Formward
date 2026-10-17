# Formward 项目交接

更新日期：2026-10-17。仓库 `/home/obl1vion/projects/Formward`，main。先读根README、AGENTS、本文与目标目录最近README；Next.js改动先读node_modules/next/dist/docs/对应指南。

## 当前用户决定与实现

代码支持身体、摄入和食材混合提交，一次审核，逐项核对／修改／取消只更新草稿，底部统一事务保存。三类独立取舍，取消入库仍保留本餐营养规格与对应图片；图片修改展示前后对照。手机底部吸附操作栏，新增不显示空值比较，依据与技术信息折叠。保存成功显示勾，2秒返回总览；旧链接与已有部分结果兼容。总览红蓝柱居中、共用零点，负差值向下，并为摄入保留足够的正向绘图区。

仓库协议为 OpenAPI 1.9.0／MCP 1.6.0，共11工具；0018_sudden_silverclaw 仅新增 record_operations，schema 共30张业务／认证表。共享数据库仍为0017，统一审核代码尚未部署；发布前须备份并执行0018，再部署兼容代码。

首页以一张图统一每日摄入 kcal、相对区间首个有效晨重的变化 kg、同日晚重减晨重的带符号差值 kg。蓝色摄入柱用左轴；金色晨重线与红色晨晚差柱共用右轴，晨重基准标日期和真实 kg。默认30D且显示已有估计；估计用虚线／纹理，不生成估计，缺日留空、多候选不擅选。7D／30D／90D／全部／自定义均固定宽度，支持悬停、聚焦、方向键和日期详情跳转。图下身体卡显示最近真实晨间或晚间体重及日期，摄入卡显示今天和“预算未设置”，整卡进入详情。Logo回总览，详情有返回入口，页头不重复列三个模块。

饮食每日柱从下到上为P蛋白质 #365E78、C碳水 #6C96B3、F脂肪 #AFCDDE；默认 P:C:F 克数占比，可切换 4P:4C:9F 能量占比；分段和读数同步切换，柱总高始终为已记录 kcal，不改写原值。宏量缺项／全零时只显示总热量及占比不完整。字母仅在宽高容许时显示，读数包含kcal、g和占比。7／30／90天固定宽度，日期间留白；短范围柱顶数字，长范围只显示当前日与完整范围，连线默认关闭。

记录一餐左侧为搜索、整餐／食材筛选和可点击／拖拽卡片，右侧是常驻本餐合计及名称／用量／kcal／P／C／F小表格。始终保留一个空白行自由填写，空白不保存；桌面双击或Enter编辑、Tab移动，手机轻点并保留选择／本餐分步。份／勺等计数默认1，重量／体积／未知单位留空；换食材重新按单位设置。库营养只读换算，自由项为本次营养不乘分量。新餐按设备小时建议餐次，编辑旧餐不覆盖。依据、规格、备注、照片、事实核对、缺图／重复／忙碌与失败保留草稿继续可用。

最近删除统一显示食材库和餐次，可逐条恢复或永久删除。普通删除可恢复，永久删除仅限已删、本账号且版本匹配的条目，界面明确确认名称和不可恢复。删食材断开所有版本food_id，保留数量、原单位、营养、food_snapshot和照片，受影响餐次递增版本并审计；无可用快照拒绝删除。餐项查询返回id，编辑以originalItemId引用同餐同版本快照；不接受客户端营养快照，不能把已删食材加入新餐。删餐移除全部子项和当前图片关联，原始导入／操作／审计／原图仍保留；没有Blob垃圾清理或隐私擦除。本功能为独立网页Action和feature事务，不增加MCP永久删除工具。

## 仓库与生产

正式地址 [Formward](https://formward-ten.vercel.app)，线上已验证 READY 部署 `dpl_FjJvchTHhfULjJGbeCHjUio9EksM`，功能提交 `0c6c539`。线上协议 OpenAPI 1.8.0／MCP 1.5.0，共9工具；数据库0017，29张业务／认证表加Drizzle账本。Vercel CLI手动发布，Git不会自动部署。Node.js24.21.0、pnpm9.15.9、Next.js16.3.7。

0017仅为foods新增category（meal／ingredient，NOT NULL默认ingredient，CHECK），旧字段与记录保留，账本仅新增1次。已授权将Pasta Express和KL套餐两条当前记录标为meal，其他7条为ingredient；不修改营养、单位、说明或任何历史餐次。全库核对27张其他表以及全部既有操作／审计保持，仅新增1个维护操作和2条事件。

私有备份／报告均0600，Git与部署忽略，不输出健康值或凭据：

- `data/exports/database-before-unified-overview-2026-10-16.json`
- `data/exports/database-after-unified-migration-2026-10-16.json`
- `data/exports/database-after-unified-categories-2026-10-16.json`
- `data/exports/unified-migration-verification-2026-10-16.json`
- `data/exports/food-categories-2026-10-16*`、`food-categories-verification-2026-10-16.json`
- `data/exports/unified-categories-storage-verification-2026-10-16.json`

分类和说明维护通过scripts/maintain-foods.mts／food-maintenance.ts指定账号、ID／版本及摘要，updateMealDescriptions:false保持历史餐项。较早的food-editor-cleanup、food-analysis-correction、food-analysis-cut-specification私有请求／结果和database-before／after-food-analysis备份仍保留，历史营养、克数／勺数和原始请求／审计不改。ON当前每1勺约30.4g；Pasta保留原成分估计克数及汇总区间；牛排保留“可能保留中央筋膜”的原不确定措辞。

## 原图与审核

原图最多8张、每张20MiB，JPEG／PNG／WebP原字节。网页OIDC预签名直传Private Blob，大图不经过Function；旧multipart只兼容4MiB。Production-only存储用BLOB_STORE_ID和平台OIDC，无静态令牌。MCP立即下载ChatGPT临时URL，逐图返回complete／partial／failed、code／stage／retryable／requestId；最多两张并行，临时错误一次重试，部分成功保留。

旧4MiB限制曾用有效5,072,913字节虚构PNG复现，新版20MiB通过；用户最初原图／响应未保留，不能认定当时单一原因。后来午餐日志明确image_url，ChatGPT的oaisdmntprnznorth／westus地区账号被旧列表拒绝；当前限定oaisdmntpr前缀、最多24位小写账号名和完整blob.core.windows.net后缀，逐跳验证重定向。其他账号族、额外子域与伪装后缀拒绝。日志不写健康内容、文件名、URL、签名或凭据。

用户该次晚餐图确认后已关联，午餐仍缺原图；不能恢复过期地址，需用户原图重试。已有餐次补图按id／version更新，不新增重复餐。expectedImageCount保留预期，缺图仅经网页登录明确选择先保存文字并审计；photoReview事实问题仍须核对，AI不能代确认。保存后按ID／revision／终态更新，旧pending不能覆盖已保存；其他独立pending不自动取消。

## 业务与界面约定

食材详情不重复四项营养，保留组成／各成分分量 → 来源与计算 → 汇总结果。未保存的分项不补造；不写个人餐次日期、上传／纠错背景、泛化生熟提醒或无关排除清单，个人备注留餐次。food-description.ts在创建／修订／确认食材时检查，food_description后可纠正并沿用operationId，已完成请求幂等不受新规则阻断。search_foods和HTTP查询实时附foodLibraryRules。工具定义改变后刷新ChatGPT连接并开新对话，刷新不会整理旧数据。

手动依据只有reference（标签／成分表）和estimated，AI及旧label／composition_table／unknown保留；旧misc／whole兼容，用户编辑后统一food，不批量改写历史。食材分类独立于餐项kind，基础预设／采用代码与入口已移除，已入库食材保留。

身体晨间空腹／晚间非空腹、凌晨归前日晚间；普通保存不估算，normal morning-baseline-v3和historical-initialization-v1冻结规则保持。身体详情晨晚差只取真实配对，总览可显示已有估计的差值，不解释为确定热量因果。来源建议删除不改历史，网页来源可留空，AI需核对实际来源或明确留空。

身体和饮食Inspector共用遮罩手势：内容拖选到外部松开不关闭，真实遮罩小幅按下／抬起才关闭。Escape、焦点、忙碌保护与滚动锁保留；根滚动gutter防切页横移。合法date参数打开指定日期，普通入口不自动弹窗。app仅入口，features共享业务，db集中schema；未知null、user_id隔离、版本／快照／幂等／审计，AI正式保存仍需网页登录确认。

## 验证与后续

275项单元／集成测试、lint、typecheck、production build、目录结构与git diff --check通过。统一审核专项、饮食、身体、AI、加载反馈和认证／OAuth浏览器回归通过；统一专项覆盖1440／1100／390／320px、双PFC口径、共同零点、图片对照、独立取舍、成功自动返回，以及旧身体链接多次操作和跨页草稿保护。截图位于 /tmp/formward-records-visual/；测试均使用独立数据库和虚构账号。饮食／总览浏览器覆盖1440／1100／390／320px、7／30／90D、统一图、模块入口、表格／拖拽／单位、分类、删除恢复／永久删除、删食材后旧餐编辑、照片与缺图审核及跨账号。身体／来源／AI／加载反馈回归通过；AI验收等待客户端本地日期就绪后检查完整今天行。所有本机验收使用独立PGlite、端口和虚构数据。

正式站虚构账号验收覆盖四种宽度、三个区间、统一图与入口卡、三色图、表格双击／触屏轻点／拖拽、默认用量、分类、恢复／永久删除、旧餐按原克数修改，客户端异常0；虚构健康记录、操作、账号、会话和令牌均已清理。报告 `/tmp/formward-unified-production.json`，截图 `/tmp/formward-unified-production/`；公开入口、协议字段、OAuth metadata／公钥、MCP401challenge、登录保护和私有文件404见 `/tmp/formward-unified-final-http.json`；正式别名inspect见 `/tmp/formward-unified-final-inspect.log`，运行时错误检查见 `/tmp/formward-unified-runtime-errors.jsonl`。

真实iPhone／微信观感、用户原照片重试仍由用户最终核对。后续范围为身体准确时间／归属网页纠正、持久代表选择、身体网页删除恢复／导入，以及运动、消耗、目标和设备连接；本轮不做预算设置或消耗模块。

定位见[界面](docs/interface.md)、[代码索引](docs/code-study.md)、[饮食](docs/meals.md)、[身体](docs/measurements.md)、[数据库](docs/database.md)、[部署](docs/deployment.md)。
