# 饮食记录

负责今天摄入、P／C／F 每日 kcal 堆叠图、历史餐次、整餐／食材库、最近删除、私有原图与 AI 网页审核。model.ts 集中校验、单位换算、图形占比和餐次建议；records.ts 共用网页／HTTP／MCP 的预览、确认、归属、版本、历史快照和审计；recently-deleted.ts 提供网页专用永久删除事务；food-description.ts 管食材客观分析规则，queryFoods 实时返回规则及兼容的 presets:[]。

餐次编辑桌面左侧为可搜索、按整餐／食材筛选的卡片，点击或拖入右侧小表格；手机保留选择／本餐分步。右侧顶部常驻合计，每项一行：名称、用量、kcal、P、C、F、操作，并常驻一行空白自由填写。桌面双击或 Enter 编辑、Tab 移动，触屏轻点；食材营养自动换算只读，自由项营养是本次摄入，不再次乘分量。份／勺等计数单位默认 1，重量、体积和未知单位留空；更换食材按新单位重新设置。新餐次按设备时间建议早餐／午餐／加餐／晚餐／夜宵，可手改，旧餐不覆盖。依据、新食材规格、备注和照片按需展开，上传／缺图／重复／审核保护保留。

每日一根三色 kcal 堆叠柱，由下到上为 P 蛋白质 #365E78、C 碳水 #6C96B3、F 脂肪 #AFCDDE。按 4P:4C:9F 能量占比分配已记录热量，柱总高保持原 kcal，不重算保存值；宏量缺项或全部为零时只画总热量并注明占比不完整。容得下才标 P／C／F，读数列出 kcal、克数和占比。日期之间留白，固定宽度无横向滚动，短区间柱顶显示数值，长区间只显示选中日期和完整范围，可选连线默认关闭。

食材 category 为 meal（整餐）或 ingredient（食材），0017 为旧行增加默认 ingredient；可按版本与摘要授权修正指定条目分类，历史快照不变。移除基础预设和采用入口，已加入的食材继续保留。手动新餐项 kind:food，AI 及旧 misc／whole 继续兼容。手动依据 reference／estimated，AI 的 label／composition_table／unknown 保留。food-maintenance.ts 和 text-maintenance.ts 仅用于已授权的私有维护。

最近删除统一包含食材库与餐次，支持逐条恢复或永久删除。普通删除仍可恢复；永久删除只对已删除且版本匹配的本账号条目执行，并要求含名称的明确确认。食材永久删除时断开全部版本餐项的 food_id，保留营养、数量、原单位 food_snapshot 与原图，递增受影响餐次版本并审计；缺少可用快照则拒绝。旧餐通过查询返回的 item.id 作为 originalItemId 编辑，服务端在同一餐次／版本解析历史快照；不接受客户端营养快照。永久删除餐次物理移除其餐项和当前图片关联。原始导入、操作、审计和原图继续保留，不实现 Blob 清理或隐私擦除。网页专用事务具备归属、状态、版本、幂等、账号锁和失败回滚，不开放 MCP 永久删除工具。

meal-editor.tsx 管表格与选择，nutrition-fields.tsx 管营养与依据，nutrition-chart.tsx 管固定宽度图，presets.tsx 仅保留食材表格／详情，review-details.tsx 管紧凑审核与逐项依据，meal-review.tsx 管审核终态。估算分析保留成分分量、来源／计算及汇总，不写个人餐次背景、泛化提醒或无关排除清单。

images.ts 管原图下载与存储，image-upload.ts 管限账号／路径／摘要的短期 OIDC 直传，photos.tsx 共用上传与回看。最多8张、每张20 MiB，JPEG／PNG／WebP，不进 public／Git。允许既有 OpenAI 文件域名及限定 oaisdmntpr 账号、24位长度与完整 blob.core.windows.net 后缀，逐跳验证重定向。expectedImageCount 保留缺图预期，AI photoReview 待核对阻止保存，只有网页登录明确选择才可先保存文字并审计。终态不能再次确认，旧 pending 不能覆盖新 revision。存储失败与上传后事务失败的清理、重试、原图归属仍覆盖隔离测试。完整规则见[饮食记录](../../../docs/meals.md)。
