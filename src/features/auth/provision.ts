import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_LENGTH_LABEL } from "./password-policy";
import { initializePersonalProfile } from "../onboarding/records";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { account, user } from "../../db/schema";

// 仅供本地管理员脚本使用；没有公开注册 HTTP 入口。重复执行不重置已有密码。
export async function provisionAccount(db: Database, input: { email: string; password: string; name?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("请输入有效邮箱。");
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) throw new Error(`密码长度需为 ${PASSWORD_LENGTH_LABEL}。`);
  const password = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const id = randomUUID();
    const [created] = await tx.insert(user).values({ id, email, name: input.name?.trim() || email.split("@")[0] }).onConflictDoNothing({ target: user.email }).returning();
    if (!created) {
      const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
      return { id: existing.id, created: false };
    }
    await initializePersonalProfile(tx, id);
    await tx.insert(account).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password });
    return { id, created: true };
  });
}
