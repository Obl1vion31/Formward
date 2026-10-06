import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { user } from "../src/db/schema";
import { previewMeasurementTsv } from "../src/features/imports/measurements";
import { listMeasurements, saveImportedMeasurements } from "../src/features/measurements/records";

const [file, email, mode, timezone, fastingFlag] = process.argv.slice(2);
if (!file || (mode && mode !== "--write" && mode !== "--preview") || (mode === "--write" && !email) || (fastingFlag && fastingFlag !== "--daytime-fasting")) {
  throw new Error("用法：node --env-file=.env.local --import tsx scripts/import-measurements.mts 文件路径 [账号邮箱] [--preview|--write] [IANA时区] [--daytime-fasting]");
}
const preview = previewMeasurementTsv(await readFile(file, "utf8"), timezone ?? null, fastingFlag === "--daytime-fasting");
console.table(preview.records.map(({ sourceLocalTime, analysisDate, period, weightKg }) => ({
  原始当地时间: sourceLocalTime, 归属日: analysisDate, 时段: period === "daytime" ? "白天" : "晚间", 体重: weightKg,
})));
console.log(`${preview.records.length} 条；时区：${timezone ?? "未知"}；白天空腹：${fastingFlag ? "用户已确认" : "未知"}。`);
if (mode === "--write") {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("请配置 DATABASE_URL。");
  const database = createDatabase(url);
  try {
    const [owner] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
    if (!owner) throw new Error("指定账号不存在；未创建账号或写入记录。");
    const result = await saveImportedMeasurements(database.db, {
      userId: owner.id, actorId: owner.id, fileDigest: preview.fileDigest,
      sourceLabel: basename(file), captureChannel: "chat", records: preview.records,
    });
    console.log(JSON.stringify(result));
    const saved = await listMeasurements(database.db, owner.id);
    console.log(JSON.stringify({
      savedRecords: saved.length,
      daytime: saved.filter((row) => row.period === "daytime").length,
      evening: saved.filter((row) => row.period === "evening").length,
      confirmedFasting: saved.filter((row) => row.fasting === true && row.fastingSource === "user_confirmed").length,
    }));
  } finally {
    await database.close();
  }
}
