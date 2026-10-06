import { readFile } from "node:fs/promises";
import { createDatabase } from "../src/db/client";
import { applyHistoricalCompletion, previewHistoricalCompletion, type HistoricalCompletionRequest } from "../src/features/measurements/completion";

const [path, mode = "--preview", digest] = process.argv.slice(2);
if (!path || !["--preview", "--write"].includes(mode) || (mode === "--write" && !digest) || (mode === "--preview" && digest)) throw new Error("用法：node --env-file=.env.local --import tsx scripts/complete-measurements.mts 私有请求JSON --preview|--write 预览摘要");
if (!process.env.DATABASE_URL) throw new Error("请配置 DATABASE_URL。");
const input = JSON.parse(await readFile(path, "utf8")) as { userId: string; request: HistoricalCompletionRequest };
const database = createDatabase(process.env.DATABASE_URL);
try {
  const result = mode === "--preview" ? await previewHistoricalCompletion(database.db, input.userId, input.request)
    : await applyHistoricalCompletion(database.db, { userId: input.userId, actorId: input.userId, actorType: "ai", request: input.request, digest });
  console.log(JSON.stringify(result));
} finally { await database.close(); }
