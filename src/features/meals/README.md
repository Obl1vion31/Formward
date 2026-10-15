# 饮食记录

负责今天摄入、每日三色堆叠柱图、历史餐次抽屉、食材库、基础食材预设、原图与AI网页审核。model.ts 管校验与换算；records.ts 管归属、事务、版本、快照、确认和审计；image-upload.ts 管限账号／路径／摘要的短期凭据、OIDC预签名直传及幂等登记；nutrition-chart.tsx 管固定宽度柱图与直接读数；review-details.tsx 展示紧凑食物明细与逐项详情；text-maintenance.ts 仅供已授权文字修正的内部事务、版本、幂等与审计；images.ts 管原图下载、类型／大小校验、重复保护与私有 Blob；photos.tsx 共用上传及原图回看；food-presets.ts 固定六项 USDA 参考规格。

网页、MCP、HTTP 和初始化共用业务。未知值 null，额外油酱单列，整餐估算不能叠加其他项；AI照片待核对信息阻止保存；expectedImageCount保留附件预期，缺图只有网页登录明确选择先保存文字才允许，选择进入审计。canConfirm只表示正常确认可用，canConfirmWithoutImages表示还可选择先保存文字。保存终态不能再次确认，旧响应不覆盖新revision。下载允许既有OpenAI文件域名及ChatGPT使用的oaisdmntpr地区存储账号；Azure限定账号前缀、最多24位账号名及完整blob.core.windows.net后缀，重定向逐跳验证，拒绝其他命名族、额外子域和伪装后缀。原图最多8张、每张20 MiB，JPEG／PNG／WebP，经认证入口提供，不进入 public 或 Git。Vercel部署通过BLOB_STORE_ID及平台OIDC访问私有存储，本地可使用对应权限或静态凭据。上传后事务失败时按原路径清理文件，存储／清理函数可在隔离测试中替换。规则和接口见[饮食记录](../../../docs/meals.md)。
