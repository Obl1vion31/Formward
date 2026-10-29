import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "../src/db/client";
import { initializeAccountOwner, previewAccountMaintenance, recoverAccountOwner } from "../src/features/auth/account-management";
import { ApiError } from "../src/features/auth/ai-identity";

const [mode, email, expectedId] = process.argv.slice(2);
if (!["--preview", "--write", "--recover"].includes(mode) || !email || (mode !== "--preview" && !expectedId)) {
  throw new Error("用法：pnpm account:owner --preview 邮箱；核对后用 --write 邮箱 用户ID；恢复用 --recover 邮箱 用户ID。");
}
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("请先配置本机私有数据库连接。");
const database = createDatabase(url);
async function hiddenPassword(label: string) {
  if (!stdin.isTTY) throw new Error("恢复必须在交互终端中隐藏输入密码，不接受命令行密码。");
  stdout.write(label);
  return new Promise<string>((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true); stdin.resume();
    const finish = () => { stdin.setRawMode(false); stdin.off("data", receive); stdin.pause(); stdout.write("\n"); };
    const receive = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === "\r" || character === "\n") { finish(); resolve(value); return; }
        if (character === "\u0003") { finish(); reject(new Error("已取消维护。")); return; }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    stdin.on("data", receive);
  });
}
try {
  const target = await previewAccountMaintenance(database.db, email);
  console.log(JSON.stringify(target, null, 2));
  if (mode === "--preview") console.log("预览完成，未修改账号。首次指定 owner 只赋予管理权限；恢复密码会撤销该账号全部访问与重设链接。");
  else {
    if (target.id !== expectedId) throw new Error("用户 ID 与预览不符，未执行。");
    if (mode === "--write") { await initializeAccountOwner(database.db, target.id); console.log("owner 已指定，原密码及健康记录保持。登录后仍需再次验密进入后台。"); }
    else {
      console.log("恢复将修改此 owner 的密码并撤销全部登录和 AI 授权，不修改健康记录。");
      const prompt = createInterface({ input: stdin, output: stdout });
      const confirmation = await prompt.question("输入目标邮箱以确认："); prompt.close();
      if (confirmation.trim().toLowerCase() !== target.email) throw new Error("目标确认不匹配，未执行。");
      const password = await hiddenPassword("新密码（12–128 字符，输入不显示）：");
      if (password !== await hiddenPassword("再次输入新密码：")) throw new Error("两次密码不一致，未执行。");
      await recoverAccountOwner(database.db, target.id, password);
      console.log("owner 密码已恢复，旧访问已撤销，维护审计已保存。");
    }
  }
} catch (error) {
  console.error(error instanceof ApiError || (error instanceof Error && !["query", "cause", "code"].some(key => key in error)) ? (error as Error).message : "维护未完成，请检查数据库连接与 migration。");
  process.exitCode = 1;
} finally { await database.close(); }
