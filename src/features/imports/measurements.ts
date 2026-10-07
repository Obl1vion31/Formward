import { createHash } from "node:crypto";
import { validateImportedMeasurement } from "../measurements/records";

/** 三列 TSV 与旧四列兼容；旧 BMI 仅保留在原文件，不进入业务字段。 */
export function previewMeasurementTsv(contents: string, timezone: string | null = null, daytimeFastingConfirmed = false) {
  const lines = contents.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "").split(/\r?\n/);
  const legacy = lines[0] === "测量时间\t体重(kg)\tBMI\t体脂率(%)";
  if (!legacy && lines[0] !== "测量时间\t体重(kg)\t体脂率(%)") throw new Error("测量文件表头与当前支持的格式不符。");
  const records = lines.slice(1).map((line, index) => {
    const fields = line.split("\t");
    if (fields.length !== (legacy ? 4 : 3)) throw new Error(`第 ${index + 2} 行列数不符。`);
    const values = fields.map(field => field.trim());
    const sourceLocalTime = values[0], weightKg = values[1], bodyFatPercent = values[legacy ? 3 : 2];
    const record = validateImportedMeasurement({ sourceLocalTime, weightKg: weightKg || null, bodyFatPercent: bodyFatPercent || null, sourceRow: index + 2, timezone });
    return validateImportedMeasurement({
      ...record,
      fasting: record.period === "daytime" && daytimeFastingConfirmed ? true : record.fasting,
      fastingSource: record.period === "daytime" && daytimeFastingConfirmed ? "user_confirmed" : record.fastingSource,
    });
  });
  // 同一文件以不同时间含义解释时必须重新预览；不复用另一时区的导入批次。
  return { fileDigest: createHash("sha256").update(JSON.stringify([contents, timezone, daytimeFastingConfirmed])).digest("hex"), records };
}
