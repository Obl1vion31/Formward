import { writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { aiContractSnapshot } from "../src/features/mcp/contract-export";

const [output, mode] = process.argv.slice(2);
if (!output || !output.endsWith(".json") || (mode && mode !== "--replace")) throw new Error("用法：node --import tsx scripts/export-ai-contracts.mts /私有评测目录/contracts.json [--replace]");
const target = path.resolve(output), directory = path.dirname(target);
if (!(await stat(directory)).isDirectory()) throw new Error("目标评测目录必须已存在，不自动创建工作目录");
const { contract, runtime } = await aiContractSnapshot();
const data = { ...contract, contentSha256: createHash("sha256").update(JSON.stringify(contract)).digest("hex") };
const runtimePath = target.replace(/\.json$/, ".runtime.mjs");
for (const filename of [target, runtimePath]) {
  try { await stat(filename); if (mode !== "--replace") throw new Error("保留已有导出，请使用--replace更新：" + filename); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
await writeFile(runtimePath, runtime, { mode: 0o600 });
await writeFile(target, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
console.log("已离线导出" + contract.tools.length + "项工具及字段解释：" + target);
console.log("内容摘要：" + data.contentSha256 + "；未访问数据库或模型API。");
