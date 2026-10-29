import type { Database } from "../../db/client";
import { lockActiveAccount } from "./account-security";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function lockOwner(tx: Transaction, userId: string) {
  await lockActiveAccount(tx, userId);
}
