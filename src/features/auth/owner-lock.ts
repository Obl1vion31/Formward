import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { user } from "../../db/schema";
import { ApiError } from "./ai-identity";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function lockOwner(tx: Transaction, userId: string) {
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  if (!owner) throw new ApiError(404, "not_found", "账号不存在。");
}
