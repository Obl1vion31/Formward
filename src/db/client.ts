import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Neon 与本机 PostgreSQL 使用相同的驱动、schema 和业务代码。
export function createDatabase(url: string) {
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
