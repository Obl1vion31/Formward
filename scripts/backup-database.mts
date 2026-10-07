import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import postgres from "postgres";

const path = process.argv[2];
const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!path || !url) throw new Error("用法：node --env-file=.env.local --import tsx scripts/backup-database.mts data/exports/私有备份.json");
const target = resolve(path), root = resolve("data/exports");
if (relative(root, target).startsWith("..") || target === root || !target.endsWith(".json")) throw new Error("备份必须存入私有 data/exports/ 下的 JSON 文件。");
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const backup = await client.begin("isolation level repeatable read read only", async tx => {
    const tables = await tx<{ table_schema: string; table_name: string }[]>`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle') AND table_type='BASE TABLE' ORDER BY table_schema, table_name`;
    const columns = await tx`SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema IN ('public', 'drizzle') ORDER BY table_schema, table_name, ordinal_position`;
    const data: Record<string, unknown> = {};
    for (const table of tables) data[`${table.table_schema}.${table.table_name}`] = await tx`SELECT * FROM ${tx(table.table_schema)}.${tx(table.table_name)}`;
    return { createdAt: new Date().toISOString(), columns, tables: data };
  });
  await mkdir(root, { recursive: true });
  await writeFile(target, JSON.stringify(backup, null, 2), { mode: 0o600, flag: "wx" });
  console.log(`私有一致性备份已保存，包含 ${Object.keys(backup.tables).length} 张表。`);
} finally { await client.end(); }
