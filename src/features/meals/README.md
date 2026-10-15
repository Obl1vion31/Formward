# 饮食记录

负责今天摄入、每日热量柱图、历史餐次抽屉、食材库、基础食材预设、原图与AI网页审核。model.ts 管校验与换算；records.ts 管归属、事务、版本、快照、确认和审计；meal-editor.tsx 提供食材库／自由填写两种入口，桌面双栏搜索、手机分步并保留草稿；nutrition-fields.tsx 共用营养输入和两类手动依据；image-upload.ts 管限账号／路径／摘要的短期凭据、OIDC预签名直传及幂等登记；nutrition-chart.tsx 管固定宽度 kcal 柱图、直接读数和默认关闭的连线；review-details.tsx 展示紧凑食物明细与逐项详情；text-maintenance.ts 和 food-maintenance.ts 仅供已授权说明／当前规格修正的内部事务、版本、幂等与审计；images.ts 管原图下载、类型／大小校验、重复保护与私有 Blob；photos.tsx 共用上传及原图回看；food-presets.ts 固定六项 USDA 参考规格。

手动新餐项统一 kind:food，有 foodId／foodDraft 为食材，否则自由填写；自由项的营养是本次实际摄入，不再次乘分量。食材用自身单位换算，小数勺／份和克数均支持，选择或更换食材不预填用量。手动依据只有 reference（标签／成分表）和 estimated，AI 及历史 label／composition_table／unknown 仍兼容；原 misc／whole 保留，用户编辑后的新版本统一为 food。0016 只扩展食材来源约束。历史营养、用量和计量快照不随当前食材规格改变。

网页、MCP、HTTP 和初始化共用业务。未知值 null，额外油酱单列，整餐估算不能叠加其他项；AI照片待核对信息阻止保存；expectedImageCount保留附件预期，缺图只有网页登录明确选择先保存文字才允许，选择进入审计。canConfirm只表示正常确认可用，canConfirmWithoutImages表示还可选择先保存文字。保存终态不能再次确认，旧响应不覆盖新revision。下载允许既有OpenAI文件域名及ChatGPT使用的oaisdmntpr地区存储账号；Azure限定账号前缀、最多24位账号名及完整blob.core.windows.net后缀，重定向逐跳验证，拒绝其他命名族、额外子域和伪装后缀。原图最多8张、每张20 MiB，JPEG／PNG／WebP，经认证入口提供，不进入 public 或 Git。Vercel部署通过BLOB_STORE_ID及平台OIDC访问私有存储，本地可使用对应权限或静态凭据。上传后事务失败时按原路径清理文件，存储／清理函数可在隔离测试中替换。规则和接口见[饮食记录](../../../docs/meals.md)。
