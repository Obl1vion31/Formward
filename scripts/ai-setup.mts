import { chmod, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
if (!stdin.isTTY) throw new Error("请在交互式终端运行 pnpm ai:setup，令牌输入不会显示。");
const prompts = createInterface({ input: stdin, output: stdout });
const address = (await prompts.question("Formward 网页地址（默认 http://localhost:3000）：")).trim() || "http://localhost:3000";
prompts.close();
const url = new URL(address);
if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("请使用 HTTPS 地址或本机 HTTP 地址，不包含凭据和查询参数。");
stdout.write("AI 接入令牌（输入不显示）：");
const token = await new Promise<string>((resolve, reject) => {
  let value = "";
  stdin.setRawMode(true); stdin.resume();
  const finish = () => { stdin.setRawMode(false); stdin.off("data", receive); stdin.pause(); stdout.write("\n"); };
  const receive = (chunk: Buffer) => {
    for (const char of chunk.toString()) {
      if (char === "\r" || char === "\n") { finish(); resolve(value.trim()); return; }
      if (char === "\u0003") { finish(); reject(new Error("已取消配置。")); return; }
      if (char === "\u007f" || char === "\b") value = value.slice(0, -1); else if (char >= " ") value += char;
    }
  };
  stdin.on("data", receive);
});
if (!/^fw_ai_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("令牌格式无效。");
const file = ".env.ai.local";
// wx 拒绝覆盖已有配置；换令牌时用户先删除旧文件再运行。
await writeFile(file, `FORMWARD_AI_BASE_URL=${JSON.stringify(url.href.replace(/\/$/, ""))}\nFORMWARD_AI_TOKEN=${JSON.stringify(token)}\n`, { mode: 0o600, flag: "wx" });
await chmod(file, 0o600);
console.log("已写入私有 .env.ai.local；可运行 pnpm ai:request GET /measurements。");
