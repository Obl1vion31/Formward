import { createHash } from "node:crypto";
import { validateImportedMeasurement } from "../measurements/records";

/** 只支持实际收到的四列 TSV；空值保留，不把日期或测量时段当作去重键。 */
export function previewMeasurementTsv(contents: string, timezone: string | null = null, daytimeFastingConfirmed = false) {
  const lines = contents.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "").split(/\r?\n/);
  if (lines[0] !== "测量时间\t体重(kg)\tBMI\t体脂率(%)") throw new Error("测量文件表头与当前支持的格式不符。");
  const records = lines.slice(1).map((line, index) => {
    const fields = line.split("\t");
    if (fields.length !== 4) throw new Error(`第 ${index + 2} 行列数不符。`);
    const [sourceLocalTime, weightKg, bmi, bodyFatPercent] = fields.map((field) => field.trim());
    const record = validateImportedMeasurement({ sourceLocalTime, weightKg, bmi: bmi || null, bodyFatPercent: bodyFatPercent || null, sourceRow: index + 2, timezone });
    return validateImportedMeasurement({
      ...record,
      fasting: record.period === "daytime" && daytimeFastingConfirmed ? true : record.fasting,
      fastingSource: record.period === "daytime" && daytimeFastingConfirmed ? "user_confirmed" : record.fastingSource,
    });
  });
  // 同一文件以不同时间含义解释时必须重新预览；不复用另一时区的导入批次。
  return { fileDigest: createHash("sha256").update(JSON.stringify([contents, timezone, daytimeFastingConfirmed])).digest("hex"), records };
}
