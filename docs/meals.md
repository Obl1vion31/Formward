# 饮食记录

## 今天、历史与汇总

/dashboard/meals 默认显示设备时区的今天、四项摄入及今天餐次，日期跨日刷新。记录一餐默认今天；历史通过柱图或历史记录抽屉选择日期、补录、编辑、删除／恢复。顶部摘要始终今天。营养素默认每天三根并列柱（蛋白质暖黄、碳水暖白、脂肪柔红），g纵轴从零起；热量独立kcal柱图。保留7D／30D／90D／全部／自定义，触屏7D、桌面30D，长区间横向浏览。无记录不是零，缺项仅显示已知合计。

food为具体食物，misc只估未单列的剩余，每餐最多一个；whole为唯一整餐项。初始化一行一餐，whole／initialization及原备注，未知品牌和地点留空，不提前创建食材。饮食统计日期按用户指定，不套用身体凌晨规则。

## 食材与油酱

食材保存名称、品牌／规格做法、基准数量／单位、四项营养、来源及多张照片。标签和成分表须有转录或来源链接；营养依据独立于AI／人工入口。数量按同单位基准换算；每100g规格不能凭图片变成一份。热量独立保存，未知null，历史快照不随食材更新改变。

基础食材有鸡胸肉、去皮鸡腿肉、牛里脊、全蛋、养殖大西洋三文鱼和熟白米饭，均明确生熟、部位及无额外油酱。数据来自[USDA SR Legacy 2018官方JSON](https://fdc.nal.usda.gov/download-datasets/)，具体FDC标识及来源在food-presets.ts；只读预设通过采用／foodDraft确认加入本账号，不把预设伪装成用户已有食材。

纯食材、实际摄入烹饪油、蘸酱分别列food。先问本次做法与用量，再接受明确估算或未知；锅中投入的油不等于全部吃下，已包含油酱的成品或整餐不再叠加。amountDecision区分provided、estimate_accepted、unknown_accepted。明确未知食材量保留关联及null营养，不默认一份。

## 图片与AI审核

流程：识别→查库→集中补问→带图预览→网页登录确认。缺日期、餐次、食物身份或实际食用量先问；已明确的信息不重复问。完整包装／一盘须确认实际吃了多少。包装录入核对品牌、每100g／每份／整包及kJ／kcal，保留标签转录、换算依据和原图。

原图最多8张、每张4 MiB，支持JPEG／PNG／WebP。MCP import_meal_images或HTTP POST /api/v1/meal-images接受ChatGPT文件引用，私有保存后返回id；餐次、食材及foodDraft使用imageIds。原图不进入64 KiB营养请求，也不存入public。网页录入和审核可补传，显示缩略图并查看原图。下载失败／临时地址过期保留草稿并明确重试。服务器仅下载受支持的ChatGPT HTTPS文件域名，不接收任意内网地址。

照片AI餐次需photoReview：dateConfirmed、mealTypeConfirmed、identityConfirmed、amountConfirmed、cookingConfirmed和questions。只有用户明确提供／核对时标true；未解决问题返回needsUserInput并阻止确认。网页修改可逐项核对后更新预览。模型的事实判断仍需实际ChatGPT验收，正式保存始终通过网页登录明确确认。

图片及关联带user_id，数据库组合外键和feature均校验归属。内容摘要保护重复上传，原图在编辑及软删除恢复后保留；附件移除不销毁审计引用的原图。

## 接口、代码与上线

网页、HTTP、MCP调用同一feature。model.ts管校验换算；records.ts管归属、重复、预览、确认、版本和审计；images.ts管原图；photos.tsx为共用界面；food-presets.ts及presets.tsx为基础规格；meals-view.tsx为今天、柱图与历史，meal-review.tsx为审核。

save_food／save_meal与删除恢复兼容原协议，附件和核对字段为新增可选字段。search_foods／GET foods返回用户foods和只读presets；query_meals可传timezone，context返回当地日期。AI预览15分钟，初始化长期保留；revision和健康快照防覆盖，撤销阻止保存，相同operationId保护重试。

生产使用Vercel私有Blob，配置见[部署说明](deployment.md)。部署应用前备份数据库并执行0014_meal_images migration；旧初始化和记录无需补照片。公网部署状态见[交接](../handoff.md)。
