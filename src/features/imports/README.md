# Imports

负责私有文件的只读解析、字段映射、校验、预览、确认和结果报告。`measurements.ts` 已支持实际收到的四列 TSV（测量时间、体重 kg、BMI、体脂率 %），调用 measurements 的统一校验，并保留空值和来源行。时区与白天空腹条件必须由明确的来源或用户确认提供；晚间按已确认产品规则统一非空腹，来源为 `evening_rule`。

正式写入通过 measurements 的事务函数完成，维护入口为 `scripts/import-measurements.mts`。通用 Excel、网页上传、AI 候选与正式确认端点尚未实现。原始文件不修改，不放入 public；测试使用虚构或脱敏样本。
