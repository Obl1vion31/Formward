import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../src/db/client";

const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!url) throw new Error("请在 .env.local 填入 DATABASE_URL。");
const database = createDatabase(url);
try {
  await migrate(database.db, { migrationsFolder: "./drizzle" });
  console.log("数据库 migration 已完成。");
} finally {
  await database.close();
}
