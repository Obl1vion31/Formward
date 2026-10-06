import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { user } from "../src/db/schema";
import { applyMeasurementMaintenance, previewMeasurementMaintenance, restoreMeasurement } from "../src/features/measurements/maintenance";

const [email, mode = "--preview", value] = process.argv.slice(2);
if (!email || !["--preview", "--write", "--restore"].includes(mode) || (mode !== "--preview" && !value) || (mode === "--preview" && value)) {
  throw new Error("用法：node --env-file=.env.local --import tsx scripts/maintain-measurements.mts 账号邮箱 --preview|--write 预览摘要|--restore 记录ID");
}
if (!process.env.DATABASE_URL) throw new Error("请配置 DATABASE_URL。");
const database = createDatabase(process.env.DATABASE_URL);
try {
  const [owner] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
  if (!owner) throw new Error("指定账号不存在；没有写入。");
  if (mode === "--preview") console.log(JSON.stringify(await previewMeasurementMaintenance(database.db, owner.id)));
  else if (mode === "--write") console.log(JSON.stringify(await applyMeasurementMaintenance(database.db, { userId: owner.id, actorId: owner.id, digest: value })));
  else console.log(JSON.stringify(await restoreMeasurement(database.db, { userId: owner.id, actorId: owner.id, id: value })));
} finally {
  await database.close();
}
