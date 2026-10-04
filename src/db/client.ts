import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Neon 与本机 PostgreSQL 使用相同的驱动、schema 和业务代码。
export function createDatabase(url: string) {
  // Node 的单地址默认尝试仅 250ms，跨区域连接可能在 TCP 建连前被切换到下一地址。
  // postgres.js 使用 Node 默认 socket；进程内设为至少 1 秒，保留部署环境更长的设置。
  setDefaultAutoSelectFamilyAttemptTimeout(Math.max(1000, getDefaultAutoSelectFamilyAttemptTimeout()));
  const client = postgres(url, { max: 3, prepare: false, connect_timeout: 15, idle_timeout: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
const shared = globalThis as typeof globalThis & { formwardDatabase?: ReturnType<typeof createDatabase> };

export function getDatabase() {
  if (!shared.formwardDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("请在 .env.local 配置 DATABASE_URL，并执行 pnpm db:migrate。");
    shared.formwardDatabase = createDatabase(url);
  }
  return shared.formwardDatabase.db;
}
