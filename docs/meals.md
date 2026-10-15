# 饮食记录

## 今天、历史与汇总

`/dashboard/meals` 默认显示设备时区的今天、四项摄入及今天餐次，跨日刷新。记录一餐默认今天；历史通过柱图或历史记录抽屉选择日期、补录、编辑、删除／恢复。顶部摘要始终是今天，今日概况保持当天事实汇总。

营养素每天一根三色堆叠柱：蛋白质暖黄、碳水暖白、脂肪柔红。三段连续堆叠，日期之间留空隙；纵轴从零起，柱高为三大营养素的已知克数合计，不能解释为热量。热量用独立 kcal 柱图。图例、鼠标悬停／键盘聚焦显示具体营养素、合计和热量，点击打开当天餐次；手机直接点击。保留 7D／30D／90D／全部／自定义，触屏默认 7D、桌面默认 30D，长区间横向浏览。无记录留空，缺项只显示已知合计。

`food` 为具体食物，`misc` 只估未单列的剩余，每餐最多一个；`whole` 是唯一整餐项。初始化一行一餐，保留 whole／initialization 及原备注，未知品牌和地点为空，不提前创建食材。饮食日期按用户指定，不套用身体凌晨规则。

## 食材与油酱

食材库直接列有效食材，名称、简短规格和实际基准数量常驻；蛋白质、碳水化合物、脂肪、热量按列对齐。营养值按该食材真实基准展示，不能把每包营养伪装成每 100g。依据、备注、来源和照片放在详情；删除记录放入次级“最近删除”，可恢复，底层软删除与历史快照保持。

基础食材为鸡胸肉、去皮鸡腿肉、牛里脊、全蛋、养殖大西洋三文鱼和熟白米饭。界面只保留去皮去骨、生重／熟重、每 100g 等必要规格，不常驻额外油酱的冗长说明；原始数据与预设身份保持，避免重复采用及改变历史。数据来自 [USDA SR Legacy 官方资料](https://fdc.nal.usda.gov/download-datasets/)，标识及来源在 `food-presets.ts`。预设通过采用／foodDraft 确认加入本账号。

同单位按基准换算，每 100g 不能凭图片变成一份。热量独立保存，未知为 null，历史快照不随食材更新改变。标签及成分表须保存转录或来源链接。

纯食材、实际吃下的烹饪油、蘸酱分别记录。先核对做法与用量，再接受明确估算或未知；锅中投入的油不等于全部吃下，成品或整餐已经含油酱时不叠加。`amountDecision` 区分 provided、estimate_accepted、unknown_accepted；明确未知食量保留关联和 null 营养，不默认一份。

## 图片上传与恢复

每餐／食材最多 8 张、单张 20 MiB，支持原始 JPEG／PNG／WebP，不自动压缩。所有原图保存在 Private Blob，通过账号鉴权回看，不进入 public、Git 或营养 JSON 请求体。

MCP `import_meal_images` 和 HTTP `POST /api/v1/meal-images` 接受 ChatGPT files 引用，立即下载临时地址后私有保存，返回稳定 ID。最多两个下载并发，临时网络／5xx 最多重试一次，批次有截止时间；返回 complete／partial／failed、images、expectedImageCount 以及逐图 failures（index、code、stage、retryable、requestId）。部分成功保留已保存附件，只重试失败项。成功附件仍须加入对应餐次预览；已有餐次查询 id/version 后保留原内容更新。预览包含原图时应说明等待网页确认，确认后查询最新审核／餐次再报告关联状态，不把确认前文案当成实时状态。临时地址过期明确返回 image_url_expired，不能反复重用失效地址；服务端只下载允许的 ChatGPT HTTPS 文件域名，不接收任意外部／内网地址。除 oaiusercontent.com、chatgptusercontent.com、openai.com 的文件域名外，兼容 ChatGPT 的 oaisdmntpr 地区存储账号，例如 oaisdmntprnznorth.blob.core.windows.net 和 oaisdmntprwestus.blob.core.windows.net；Azure 账号名限 24 位小写字母／数字，限定完整前缀及 blob.core.windows.net 后缀。重定向每一跳重复校验，拒绝其他命名族、额外子域和伪装后缀。

网页使用 prepare → 短期 OIDC 预签名 → 浏览器直传私有 Blob → complete 登记。大图不经过 Vercel Function 请求体；凭据限定账号、随机路径、SHA-256、真实类型、大小和 10 分钟有效期，完成后核对实际字节，重复原图复用 ID。SDK 预签名流程不依赖 webhook。旧 multipart 客户端只兼容 4 MiB，需刷新使用新版直传。

网页显示进度、已完成缩略图、错误和“重试未完成照片”。失败保留输入与上传预期；“稍后补传”只清除上传阻断，保留缺图标识。餐次／食材 `expectedImageCount` 大于实际附件数时正常确认禁用，用户可补传后更新预览，或明确点击“先保存文字记录”；这个决定和缺图数进入审计，AI 不能自行忽略缺图保存。

内容摘要、user_id、组合外键和 feature 校验保护重复及归属。编辑、软删除恢复、食材快照与审计保留原图；移除附件不销毁审计引用。

## AI 录入与审核

流程：上传原图 → 识别 → 查已有食材 → 集中核对必要信息 → 带图预览 → 网页确认。缺日期、餐次、身份或实际食用量先问，明确的信息不重复问。包装／一盘须确认实际吃下多少；标签核对品牌、每 100g／每份／整包、kJ／kcal，并保留转录及换算依据。用户明确接受的生重、油酱估算写入依据，不继续伪装成未解决问题。

照片 AI 餐次 `photoReview` 包括 dateConfirmed、mealTypeConfirmed、identityConfirmed、amountConfirmed、cookingConfirmed 和 questions；未解决信息返回 needsUserInput 并阻止保存，缺图本身不替代这些事实核对。网页可逐项修改后更新预览。

审核常驻日期、餐次、食物数、分项／整餐／剩余合并方式、每项数量和四项营养。区分引用已有食材、确认后新增入库及直接记录，避免把预览解析出的临时 ID 当成已有食材。展开“查看估算依据与来源”可查看食物识别、份量、油酱与营养分别来自用户、标签、食材库、成分表、估算或未知，附可核实说明、来源与不确定性；旧记录只展示已有依据，不补造详细推理。

保存后审核显示“已保存”和结果，移除待确认与确认按钮。客户端按操作 ID、revision 和终态更新，旧 pending 响应不能覆盖完成状态；可加载最新审核状态，页面刷新仍从数据库读取。待确认入口只列实际未过期的 pending 操作，独立未处理提交不会因为另一条已保存而消失。15 分钟预览、凭据撤销、归属、版本、快照和幂等保护保持。

## 代码与维护

网页、HTTP、MCP 复用同一 feature。`model.ts` 管 schema 与换算，`records.ts` 管事务／预览／确认，`images.ts` 管下载与私有存储，`image-upload.ts` 管直传凭据和登记，`photos.tsx` 管上传／回看，`review-details.tsx` 管营养明细与依据，`meal-review.tsx` 管审核状态，`meals-view.tsx` 管今天／图表／历史，`presets.tsx` 管食材表格。

仪表盘根滚动容器预留 scrollbar-gutter；共用弹窗锁定 html／body，仅补偿实际释放的滚动条宽度，切页和弹窗不改变内容横向位置。窄屏表格在局部横向浏览，不撑宽页面。

数据库通过 `0015_meal_review_images.sql` 增加 nullable review_explanation，并把原图大小约束提高至 20 MiB。既有 migration 不修改，旧记录不补造依据或原图预期。备份、发布与验收见 [部署说明](deployment.md)，当前状态见 [交接](../handoff.md)。
