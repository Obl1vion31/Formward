import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

type Connection = { url: string; host: string; port: string; database: string; user: string; password: string; parameters: URLSearchParams };
type DatabaseInfo = { version: string; major: number; encoding: string; collate: string; ctype: string; extensions: string[] };
type SequenceState = { schema: string; name: string; definition: string; lastValue: string; isCalled: boolean };
type Manifest = {
  format: "formward-database-rehearsal-v1";
  database: DatabaseInfo;
  tables: { schema: string; name: string; count: number; sha256: string }[];
  columns: string[];
  constraints: string[];
  indexes: string[];
  sequences: SequenceState[];
};
type RehearsalOptions = {
  sourceUrl: string;
  targetUrl: string;
  archivePath: string;
  execute: boolean;
  pgDump?: string;
  pgRestore?: string;
  progress?: (stage: "checks-passed" | "snapshot-exported" | "archive-complete" | "restore-complete") => void | Promise<void>;
};

class RehearsalError extends Error {}
const fail = (message: string): never => { throw new RehearsalError(message); };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const isInside = (root: string, target: string) => { const path = relative(root, target); return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep); };

function parseConnection(raw: string): Connection {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("数据库连接配置无效。"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) fail("需要明确 PostgreSQL 主机、用户名和数据库名。");
  const allowed = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "sslcrl", "sslcrldir", "channel_binding", "connect_timeout", "max"]);
  for (const name of url.searchParams.keys()) if (!allowed.has(name)) fail("连接串含未支持的参数，请使用独立的标准 PostgreSQL 连接串。");
  try {
    return { url: raw, host: url.hostname.replace(/^\[|\]$/g, ""), port: url.port || "5432", database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), parameters: url.searchParams };
  } catch { return fail("数据库连接配置编码无效。"); }
}

function validateTarget(targetUrl: string) {
  const target = parseConnection(targetUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.host)) fail("演练目标只允许通过本机回环地址或 SSH 隧道连接。");
  if (!/^formward_rehearsal(?:_[a-z0-9]+)*$/.test(target.database) || target.database.length > 63) fail("目标数据库名称必须是 formward_rehearsal 或其下划线后缀名称。");
  return target;
}

export function validateConnections(sourceUrl: string, targetUrl: string) {
  const source = parseConnection(sourceUrl), target = validateTarget(targetUrl);
  // 即使连接主机不同，同名源/目标仍拒绝，避免隧道或别名掩盖同一个数据库。
  if (source.database === target.database) fail("源数据库和目标数据库名称必须不同。");
  return { source, target };
}

async function outputPaths(path: string) {
  const root = resolve("data/exports"), archive = resolve(path);
  if (!isInside(root, archive) || !archive.endsWith(".dump")) fail("归档必须是私有 data/exports/ 下的 .dump 文件。");
  await mkdir(root, { recursive: true });
  const actualRoot = await realpath(root), actualParent = await realpath(dirname(archive));
  if (actualParent !== actualRoot && !isInside(actualRoot, actualParent)) fail("归档目录不得通过符号链接离开 data/exports。");
  const result = { archive: resolve(actualParent, basename(archive)), manifest: resolve(actualParent, `${basename(archive, ".dump")}.manifest.json`), report: resolve(actualParent, `${basename(archive, ".dump")}.verification.json`) };
  for (const target of Object.values(result)) {
    try { await lstat(target); fail("输出文件已存在，演练拒绝覆盖。"); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  }
  return result;
}

async function info(sql: postgres.Sql | postgres.TransactionSql): Promise<DatabaseInfo> {
  const [row] = await sql<{ version: string; versionNumber: string; encoding: string; collate: string; ctype: string }[]>`
    SELECT current_setting('server_version') AS version, current_setting('server_version_num') AS "versionNumber",
      current_setting('server_encoding') AS encoding, datcollate AS collate, datctype AS ctype
    FROM pg_database WHERE datname = current_database()`;
  const extensions = await sql<{ value: string }[]>`SELECT extname || ':' || extversion AS value FROM pg_extension ORDER BY extname`;
  return { version: row.version, major: Math.floor(Number(row.versionNumber) / 10000), encoding: row.encoding, collate: row.collate, ctype: row.ctype, extensions: extensions.map(item => item.value) };
}

export async function assertEmptyTarget(sql: postgres.Sql) {
  const [result] = await sql<{ empty: boolean }[]>`
    SELECT NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
      AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
      AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema')
      AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public'))
      AND NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql') AS empty`;
  if (!result.empty) fail("目标库必须为空；已有表、序列、函数、类型或自定义 schema 时拒绝恢复。");
}

async function catalog(sql: postgres.TransactionSql, query: string) {
  const rows = await sql.unsafe<{ value: string }[]>(`SELECT value FROM (SELECT to_jsonb(item)::text AS value FROM (${query}) item) encoded ORDER BY value COLLATE "C"`);
  return rows.map(row => row.value);
}

async function sequenceState(sql: postgres.TransactionSql): Promise<SequenceState[]> {
  const sequences = await sql<{ schema: string; name: string; definition: string }[]>`
    SELECT schemaname AS schema, sequencename AS name,
      jsonb_build_object('data_type',data_type::text,'start_value',start_value::text,'min_value',min_value::text,
      'max_value',max_value::text,'increment_by',increment_by::text,'cycle',cycle,'cache_size',cache_size::text)::text AS definition
    FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname COLLATE "C", sequencename COLLATE "C"`;
  const result: SequenceState[] = [];
  for (const sequence of sequences) {
    const [state] = await sql.unsafe<{ lastValue: string; isCalled: boolean }[]>(`SELECT last_value::text AS "lastValue", is_called AS "isCalled" FROM ${quote(sequence.schema)}.${quote(sequence.name)}`);
    result.push({ ...sequence, ...state });
  }
  return result;
}

export async function fingerprint(sql: postgres.TransactionSql): Promise<Manifest> {
  await sql`SET LOCAL TIME ZONE 'UTC'`;
  await sql`SET LOCAL DateStyle = 'ISO, YMD'`;
  await sql`SET LOCAL extra_float_digits = 3`;
  await sql`SET LOCAL search_path = pg_catalog`;
  const tables = await sql<{ schema: string; name: string }[]>`
    SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p') ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`;
  const tableHashes: Manifest["tables"] = [];
  for (const table of tables) {
    const hash = createHash("sha256"); let count = 0;
    // 直接散列 PostgreSQL 的文本表示，保留 timestamp 微秒、numeric 精度、NULL、数组和 JSONB。
    await sql.unsafe<{ value: string }[]>(`SELECT value FROM (SELECT to_jsonb(record)::text AS value FROM ${quote(table.schema)}.${quote(table.name)} record) encoded ORDER BY value COLLATE "C"`).cursor(500, rows => {
      for (const row of rows) { const bytes = Buffer.from(row.value, "utf8"), length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); hash.update(length).update(bytes); count++; }
    });
    tableHashes.push({ ...table, count, sha256: hash.digest("hex") });
  }
  return {
    format: "formward-database-rehearsal-v1", database: await info(sql), tables: tableHashes,
    columns: await catalog(sql, `SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,row_number() OVER (PARTITION BY c.oid ORDER BY a.attnum)::integer AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,co.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`),
    constraints: await catalog(sql, `SELECT n.nspname AS schema,c.relname AS table,k.conname AS name,k.contype AS type,k.convalidated AS validated,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle')`),
    indexes: await catalog(sql, `SELECT n.nspname AS schema,c.relname AS table,ic.relname AS name,i.indisvalid AS valid,i.indisready AS ready,pg_get_indexdef(i.indexrelid,0,true) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle')`),
    sequences: await sequenceState(sql),
  };
}

function runTool(binary: string, args: string[], env: NodeJS.ProcessEnv, versionOnly = false): Promise<string> {
  return new Promise((resolveTool, reject) => {
    const child = spawn(binary, args, { env, stdio: ["ignore", versionOnly ? "pipe" : "ignore", "ignore"] });
    let output = "";
    child.stdout?.on("data", chunk => { if (output.length < 4096) output += String(chunk); });
    child.on("error", () => reject(new RehearsalError("无法启动 PostgreSQL 客户端，请检查工具路径。")));
    child.on("close", code => code === 0 ? resolveTool(output) : reject(new RehearsalError(`PostgreSQL 工具执行失败（退出码 ${code ?? "未知"}）；未输出可能包含数据的原始错误。`)));
  });
}

async function toolEnvironment(connection: Connection, folder: string, label: string, readOnly: boolean) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("PG")) delete env[name];
  const escape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
  const passfile = resolve(folder, `${label}.pgpass`);
  await writeFile(passfile, [connection.host, connection.port, connection.database, connection.user, connection.password].map(escape).join(":") + "\n", { mode: 0o600, flag: "wx" });
  Object.assign(env, { PGHOST: connection.host, PGPORT: connection.port, PGDATABASE: connection.database, PGUSER: connection.user, PGPASSFILE: passfile, PGCONNECT_TIMEOUT: "15", PGAPPNAME: "formward-database-rehearsal", PGSSLMODE: "prefer" });
  const map: Record<string, string> = { sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", sslcrl: "PGSSLCRL", sslcrldir: "PGSSLCRLDIR", channel_binding: "PGCHANNELBINDING" };
  for (const [name, value] of connection.parameters) if (map[name]) env[map[name]] = value;
  if (readOnly) env.PGOPTIONS = "-c default_transaction_read_only=on";
  return env;
}

async function privateJson(path: string, value: unknown) { await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }

// 兼容此前摘要中的物理 attnum；只压实已删除列留下的空洞，仍比较实际列顺序。
export function logicalColumnFingerprint(columns: string[]): string[] {
  const tables = new Map<string, Record<string, unknown>[]>();
  for (const text of columns) {
    const column = JSON.parse(text) as Record<string, unknown>;
    if (typeof column.schema !== "string" || typeof column.table !== "string" || typeof column.column !== "string" || !Number.isInteger(column.position) || Number(column.position) < 1) fail("列摘要格式无效。");
    const key = JSON.stringify([column.schema, column.table]);
    const group = tables.get(key) ?? []; group.push(column); tables.set(key, group);
  }
  const result: string[] = [];
  for (const group of tables.values()) {
    group.sort((a, b) => Number(a.position) - Number(b.position));
    if (new Set(group.map(column => column.position)).size !== group.length || new Set(group.map(column => column.column)).size !== group.length) fail("列摘要包含重复位置或名称。");
    for (const [index, column] of group.entries()) {
      column.position = index + 1;
      result.push(JSON.stringify(Object.fromEntries(Object.entries(column).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))));
    }
  }
  return result.sort();
}

function manifestDifferences(expected: Manifest, actual: Manifest) {
  return (["tables", "columns", "constraints", "indexes", "sequences"] as const).filter(key => {
    const left = key === "columns" ? logicalColumnFingerprint(expected.columns) : expected[key];
    const right = key === "columns" ? logicalColumnFingerprint(actual.columns) : actual[key];
    return JSON.stringify(left) !== JSON.stringify(right);
  });
}

async function archiveDigest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function existingPrivatePath(path: string) {
  const root = await realpath(resolve("data/exports")), target = resolve(path);
  if (!isInside(resolve("data/exports"), target)) fail("文件必须位于私有 data/exports/ 目录。");
  const stat = await lstat(target), resolved = await realpath(target);
  if (!stat.isFile() || stat.isSymbolicLink() || !isInside(root, resolved)) fail("私有文件路径无效或指向目录外。");
  return resolved;
}

export async function verifyRestoredDatabase(options: { targetUrl: string; manifestPath: string; reportPath: string }) {
  const target = validateTarget(options.targetUrl);
  if (!options.manifestPath.endsWith(".manifest.json") || !options.reportPath.endsWith(".verification.json")) fail("需要 .manifest.json 源摘要和新的 .verification.json 结果路径。");
  const manifestPath = await existingPrivatePath(options.manifestPath);
  const archivePath = await existingPrivatePath(manifestPath.replace(/\.manifest\.json$/, ".dump"));
  const reportPath = resolve(options.reportPath), root = await realpath(resolve("data/exports")), reportParent = await realpath(dirname(reportPath));
  if (!isInside(resolve("data/exports"), reportPath) || (reportParent !== root && !isInside(root, reportParent))) fail("验证报告必须位于私有 data/exports/ 目录。");
  try { await lstat(reportPath); fail("验证报告已存在，拒绝覆盖原报告。"); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  const saved = JSON.parse(await readFile(manifestPath, "utf8")) as { archiveSha256: string; snapshot: Manifest };
  if (!/^[a-f0-9]{64}$/.test(saved.archiveSha256) || saved.snapshot?.format !== "formward-database-rehearsal-v1") fail("源摘要格式无效。");
  if (await archiveDigest(archivePath) !== saved.archiveSha256) fail("归档 SHA256 与源摘要不一致，拒绝核对。");
  const sql = postgres(target.url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    const actual = await sql.begin("isolation level repeatable read read only", tx => fingerprint(tx));
    const differences: string[] = manifestDifferences(saved.snapshot, actual);
    if (["major", "encoding", "collate", "ctype"].some(key => saved.snapshot.database[key as keyof DatabaseInfo] !== actual.database[key as keyof DatabaseInfo])) differences.push("database");
    const report = { createdAt: new Date().toISOString(), verificationMode: "existing-restored-database-read-only", passed: differences.length === 0, sourceConnected: false, targetReadOnly: true, columnPosition: "logical-order", tableCount: saved.snapshot.tables.length, rowCount: saved.snapshot.tables.reduce((total, table) => total + table.count, 0), archiveSha256: saved.archiveSha256, differences };
    await privateJson(reportPath, report);
    if (differences.length) fail(`只读核对未通过：${differences.join("、")}。新报告已保存，原报告保持。`);
    return report;
  } finally { await sql.end(); }
}

export async function rehearseDatabase(options: RehearsalOptions) {
  const { source, target } = validateConnections(options.sourceUrl, options.targetUrl);
  const paths = await outputPaths(options.archivePath);
  const sourceSql = postgres(source.url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const targetSql = postgres(target.url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  const pgDump = options.pgDump || "pg_dump", pgRestore = options.pgRestore || "pg_restore";
  let privateFolder: string | undefined;
  try {
    const sourceInfo = await sourceSql.begin("isolation level repeatable read read only", tx => info(tx));
    const targetInfo = await info(targetSql);
    await assertEmptyTarget(targetSql);
    if (sourceInfo.major !== targetInfo.major) fail("本演练要求源库和目标库使用相同 PostgreSQL 主版本。");
    if (["encoding", "collate", "ctype"].some(key => sourceInfo[key as keyof DatabaseInfo] !== targetInfo[key as keyof DatabaseInfo])) fail("源库与目标库的编码或排序规则不同，请按源库配置新建隔离目标。");
    if (sourceInfo.extensions.some(extension => !extension.startsWith("plpgsql:"))) fail("源库含额外扩展，需要先审核扩展迁移方案。");
    for (const binary of [pgDump, pgRestore]) {
      const version = await runTool(binary, ["--version"], process.env, true);
      const major = Number(version.match(/PostgreSQL\)?\s+(\d+)/)?.[1]);
      if (major !== sourceInfo.major) fail("pg_dump、pg_restore 必须与数据库使用相同主版本。");
    }
    await options.progress?.("checks-passed");
    if (!options.execute) return { dryRun: true, passed: true, postgresMajor: sourceInfo.major, targetEmpty: true, sourceReadOnly: true };

    privateFolder = await mkdtemp(resolve(tmpdir(), "formward-pg-rehearsal-")); await chmod(privateFolder, 0o700);
    const sourceEnv = await toolEnvironment(source, privateFolder, "source", true);
    const targetEnv = await toolEnvironment(target, privateFolder, "target", false);
    // 排他创建归档，后续摘要和结果也用 wx 创建，避免误覆盖已有备份。
    const archive = await open(paths.archive, "wx", 0o600); await archive.close();
    const manifest = await sourceSql.begin("isolation level repeatable read read only", async tx => {
      const [{ snapshot }] = await tx<{ snapshot: string }[]>`SELECT pg_export_snapshot() AS snapshot`;
      const before = await fingerprint(tx);
      await options.progress?.("snapshot-exported");
      await runTool(pgDump, ["--format=custom", "--schema=public", "--schema=drizzle", "--no-owner", "--no-privileges", `--snapshot=${snapshot}`, `--file=${paths.archive}`], sourceEnv);
      // 序列状态不受 MVCC 快照约束；发现演练期间有推进即停止，不误报完整一致。
      if (JSON.stringify(before.sequences) !== JSON.stringify(await sequenceState(tx))) fail("源序列在导出期间发生变化；请换一个新备份名称重试。");
      return before;
    });
    const archiveSha256 = await archiveDigest(paths.archive);
    await privateJson(paths.manifest, { createdAt: new Date().toISOString(), archiveSha256, snapshot: manifest });
    await options.progress?.("archive-complete");
    await assertEmptyTarget(targetSql);
    const restoreList = resolve(privateFolder, "restore.list");
    await writeFile(restoreList, "", { mode: 0o600, flag: "wx" });
    await runTool(pgRestore, ["--list", `--file=${restoreList}`, paths.archive], targetEnv);
    const [{ publicExists }] = await targetSql<{ publicExists: boolean }[]>`SELECT to_regnamespace('public') IS NOT NULL AS "publicExists"`;
    if (publicExists) {
      // 新数据库自带 public；只跳过重复 CREATE SCHEMA，完整保留其下所有数据和对象。
      const list = await readFile(restoreList, "utf8");
      await writeFile(restoreList, list.split("\n").map(line => /^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public(?:\s|$)/.test(line) ? `;${line}` : line).join("\n"));
    }
    await runTool(pgRestore, ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", `--use-list=${restoreList}`, "--dbname", target.database, paths.archive], targetEnv);
    await options.progress?.("restore-complete");
    const restored = await targetSql.begin("isolation level repeatable read read only", tx => fingerprint(tx));
    const differences = manifestDifferences(manifest, restored);
    const report = { createdAt: new Date().toISOString(), passed: differences.length === 0, sourceReadOnly: true, targetIsolated: true, postgresMajor: sourceInfo.major, tableCount: manifest.tables.length, rowCount: manifest.tables.reduce((total, table) => total + table.count, 0), archiveSha256, differences };
    await privateJson(paths.report, report);
    if (differences.length) fail(`恢复后核对未通过：${differences.join("、")}。私有归档与摘要已保留。`);
    return report;
  } finally {
    await Promise.allSettled([sourceSql.end(), targetSql.end()]);
    if (privateFolder) await rm(privateFolder, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, archivePath, ...rest] = process.argv.slice(2);
  if (mode === "--verify") {
    const targetUrl = process.env.FORMWARD_REHEARSAL_DATABASE_URL;
    if (!targetUrl || !archivePath || rest.length !== 1) fail("用法：node --env-file=私有目标配置 --import tsx scripts/rehearse-database.mts --verify data/exports/已有名称.manifest.json data/exports/新的名称.verification.json");
    console.log(JSON.stringify(await verifyRestoredDatabase({ targetUrl: targetUrl!, manifestPath: archivePath, reportPath: rest[0] }), null, 2));
    return;
  }
  if (!["--dry-run", "--execute"].includes(mode) || !archivePath || rest.length) fail("用法：node --env-file=.env.local --import tsx scripts/rehearse-database.mts --dry-run|--execute data/exports/唯一名称.dump");
  const sourceUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  const targetUrl = process.env.FORMWARD_REHEARSAL_DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new RehearsalError("需要源数据库配置，以及单独的 FORMWARD_REHEARSAL_DATABASE_URL。");
  const result = await rehearseDatabase({ sourceUrl, targetUrl, archivePath, execute: mode === "--execute", pgDump: process.env.FORMWARD_PG_DUMP, pgRestore: process.env.FORMWARD_PG_RESTORE,
    progress: stage => { console.log(JSON.stringify({ stage })); },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof RehearsalError ? error.message : "数据库演练失败；未输出可能含凭据或数据的原始错误，请核对环境配置和工具版本。");
    process.exitCode = 1;
  });
}
