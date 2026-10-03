import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "../src/db/client";
import { provisionAccount } from "../src/features/auth/provision";

if (!process.env.DATABASE_URL) throw new Error("请先配置 .env.local 中的 DATABASE_URL。");
const prompts = createInterface({ input: stdin, output: stdout });
const email = await prompts.question("账号邮箱：");
let password: string;
if (stdin.isTTY) {
  prompts.close();
  stdout.write("账号密码（输入不显示）：");
  password = await new Promise<string>((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    const finish = () => { stdin.setRawMode(false); stdin.off("data", receive); stdin.pause(); stdout.write("\n"); };
    const receive = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\r" || char === "\n") { finish(); resolve(value); return; }
        if (char === "\u0003") { finish(); reject(new Error("已取消账号创建。")); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", receive);
  });
} else {
  // 自动化通过 stdin 提供密码，不将密码放入命令行参数或版本控制文件。
  password = await prompts.question("账号密码：");
  prompts.close();
}
const database = createDatabase(process.env.DATABASE_URL);
try {
  const result = await provisionAccount(database.db, { email, password });
  console.log(result.created ? "账号已创建。" : "账号已存在，原密码保持不变。");
} finally {
  await database.close();
}
