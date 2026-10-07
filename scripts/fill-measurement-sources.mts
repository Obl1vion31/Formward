import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { eq, and, isNull } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { measurement } from "../src/db/schema";
import { fillMissingMeasurementSources, validateDeviceLabel } from "../src/features/measurements/sources";

const [path, mode = "--preview"] = process.argv.slice(2);
if (!path || !["--preview", "--write"].includes(mode) || !process.env.DATABASE_URL) throw new Error("用法：node --env-file=.env.local --import tsx scripts/fill-measurement-sources.mts data/exports/私有请求.json --preview|--write");
const target = resolve(path), root = resolve("data/exports");
if (relative(root, target).startsWith("..") || target === root) throw new Error("请求必须位于私有 data/exports/。");
const input = JSON.parse(await readFile(target, "utf8")) as { userId: string; deviceLabel: string };
validateDeviceLabel(input.deviceLabel);
if (!input.userId?.trim()) throw new Error("请明确目标账号。");
const database = createDatabase(process.env.DATABASE_URL);
try {
  const rows = await database.db.select().from(measurement).where(and(eq(measurement.userId, input.userId), eq(measurement.recordKind, "observed"), isNull(measurement.deviceLabel)));
  if (mode === "--preview") console.log(`目标账号有 ${rows.length} 条未知来源实测可补齐；估计、已知来源与删除状态保持。`);
  else if (!rows.length) console.log("没有待补齐的实测来源。");
  else {
    await writeFile(`${target}.before.json`, JSON.stringify(rows, null, 2), { mode: 0o600, flag: "wx" });
    const result = await fillMissingMeasurementSources(database.db, { userId: input.userId, actorId: input.userId, actorType: "development_backend" }, input.deviceLabel);
    console.log(`已补齐 ${result.updated} 条实测来源并保存审计。`);
  }
} finally { await database.close(); }
