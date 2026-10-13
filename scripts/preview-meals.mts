import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { user } from "../src/db/schema";
import { previewMealTsv, stageMealInitialization, type ReferenceMeal } from "../src/features/imports/meals";
const args = process.argv.slice(2), file = args[0], flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
if (!file) throw new Error("用法：pnpm meals:preview 私有.tsv [--reference 私有参考.json] [--email 已有账号 --stage]。默认只读核对，--stage仅创建网页确认预览。");
const contents = await readFile(file, "utf8"), references: ReferenceMeal[] = flag("--reference") ? JSON.parse(await readFile(flag("--reference")!, "utf8")) : [];
const preview = previewMealTsv(contents, references);
if (!args.includes("--stage")) console.log(JSON.stringify({ meals: preview.actions.length, source: "初始化", mode: "整餐估算", adjustments: preview.decisions.changes.length }));
else {
  const email = flag("--email"), url = process.env.DATABASE_URL;
  if (!email || !url) throw new Error("创建预览须指定已有账号--email并配置DATABASE_URL。");
  const database = createDatabase(url);
  try {
    const [owner] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
    if (!owner) throw new Error("账号不存在。");
    const operation = await stageMealInitialization(database.db, owner.id, contents, basename(file), references);
    console.log(JSON.stringify({ id: operation.id, status: operation.status, meals: operation.rows.length, canConfirm: operation.canConfirm, confirmationPath: operation.confirmationPath }));
  } finally { await database.close(); }
}
