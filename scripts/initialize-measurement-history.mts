import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase } from "../src/db/client";
import { applyHistoricalInitialization, initializationReportMarkdown, previewHistoricalInitialization, type HistoricalInitializationRequest } from "../src/features/measurements/initialization";

const [path, mode = "--preview", digest] = process.argv.slice(2);
if (!path || !["--preview", "--write"].includes(mode) || (mode === "--write" && !digest) || (mode === "--preview" && digest)) throw new Error("用法：node --env-file=.env.local --import tsx scripts/initialize-measurement-history.mts 私有请求JSON --preview|--write 预览摘要");
if (!process.env.DATABASE_URL) throw new Error("请配置 DATABASE_URL。");
const requestPath = resolve(path), privateRoot = resolve("data/exports");
if (!requestPath.startsWith(`${privateRoot}/`) || !requestPath.endsWith(".json")) throw new Error("初始化请求和报告须放在私有 data/exports 中。");
const input = JSON.parse(await readFile(requestPath, "utf8")) as { userId: string; request: HistoricalInitializationRequest };
const database = createDatabase(process.env.DATABASE_URL);
try {
  if (mode === "--preview") console.log(JSON.stringify(await previewHistoricalInitialization(database.db, input.userId, input.request)));
  else {
    const result = await applyHistoricalInitialization(database.db, { userId: input.userId, actorId: input.userId, actorType: "ai", request: input.request, digest });
    const reportPath = requestPath.slice(0, -5) + ".report";
    await writeFile(`${reportPath}.json`, JSON.stringify(result.report, null, 2), { mode: 0o600 });
    await writeFile(`${reportPath}.md`, initializationReportMarkdown(result.report), { mode: 0o600 });
    console.log(JSON.stringify({ importId: result.importId, repeated: result.repeated, generated: result.report.generatedRecords.length, replaced: result.report.replacedEstimates.length, missing: result.report.outcomes.filter(row => row.status === "missing").length, reportPaths: [`${reportPath}.json`, `${reportPath}.md`] }));
  }
} finally { await database.close(); }
