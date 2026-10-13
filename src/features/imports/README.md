# Imports

负责私有文件的只读解析、字段映射、校验、预览和导入报告。`measurements.ts` 支持三列 TSV（测量时间、体重 kg、体脂率 %），兼容旧四列输入但忽略 BMI；原文件不修改。体重与体脂可分别为空，但至少有一项，来源时间须完整到秒。时区与白天空腹条件须明确提供，晚间固定非空腹并保存 evening_rule。

正式写入通过 measurements feature 事务完成，入口为 `scripts/import-measurements.mts`。按原始时间、时区、偏移及原始体重／体脂核对重导，保留旧去重键，不覆盖编辑或复活软删除记录。通用 Excel、网页上传与正式 AI 确认入口尚未实现。原始文件在私有 data/imports 中，测试只用虚构或脱敏样本。

`meals.ts`解析饮食TSV，保留原行与整餐备注，允许私有参考显式热量；stageMealInitialization仅创建账号归属的持久预览，正式写入由meals审核事务确认。管理员入口为scripts/preview-meals.mts。文件摘要与参考资料绑定批次，重复请求复用预览。
