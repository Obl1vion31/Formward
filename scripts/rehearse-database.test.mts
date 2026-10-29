import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import postgres from "postgres";
import { logicalColumnFingerprint, rehearseDatabase, validateConnections, verifyRestoredDatabase } from "./rehearse-database.mjs";

const sourceUrl = "postgresql://fixture:fictional-password@127.0.0.1:5432/fixture_source";
test("演练拒绝公网目标、普通库名、同名源目标及未支持的连接参数", () => {
  for (const target of [
    "postgresql://fixture:fictional-password@203.0.113.1/formward_rehearsal_test",
    "postgresql://fixture:fictional-password@127.0.0.1/formward_production",
    "postgresql://fixture:fictional-password@127.0.0.1/formward_rehearsal_test?options=-c%20anything",
  ]) assert.throws(() => validateConnections(sourceUrl, target));
  assert.throws(() => validateConnections("postgresql://fixture:fictional-password@source.invalid/formward_rehearsal_test", "postgresql://fixture:fictional-password@127.0.0.1/formward_rehearsal_test"), /名称必须不同/);
  const valid = validateConnections(sourceUrl, "postgresql://fixture:fictional-password@127.0.0.1:6543/formward_rehearsal_test");
  assert.equal(valid.target.database, "formward_rehearsal_test");
});

test("逻辑列序号只消除 DROP 空洞，仍能发现列顺序变化", () => {
  const columns = (positions: number[]) => ["id", "value", "happened_at"].map((column, index) => JSON.stringify({ schema: "public", table: "records", column, position: positions[index], type: "text" }));
  assert.deepEqual(logicalColumnFingerprint(columns([1, 3, 7])), logicalColumnFingerprint(columns([1, 2, 3])));
  assert.notDeepEqual(logicalColumnFingerprint(columns([1, 3, 2])), logicalColumnFingerprint(columns([1, 2, 3])));
  assert.throws(() => logicalColumnFingerprint(columns([1, 1, 3])), /重复位置/);
});

test("真实 PostgreSQL 原生归档恢复、快照并发与空库保护", { timeout: 120_000 }, async t => {
  // 本测试只启动独立回环 PostgreSQL，并使用虚构值，不读取任何 .env 文件。
  const modulePath = process.env.FORMWARD_EMBEDDED_POSTGRES_MODULE ?? "/tmp/formward-account-tooling/node_modules/embedded-postgres/dist/index.js";
  const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
  const clusterFolder = await mkdtemp(join(tmpdir(), "formward-rehearsal-test-"));
  const exportsRoot = resolve("data/exports"); await mkdir(exportsRoot, { recursive: true });
  const outputFolder = await mkdtemp(join(exportsRoot, "fictional-rehearsal-"));
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const address = probe.address(); assert.ok(address && typeof address === "object");
  const port = address.port; await new Promise<void>(resolveClose => probe.close(() => resolveClose()));
  const cluster = new EmbeddedPostgres({ databaseDir: join(clusterFolder, "cluster"), user: "postgres", password: "fictional-rehearsal-password", port, persistent: false, onLog: () => {}, onError: () => {} });
  let source: postgres.Sql | undefined, target: postgres.Sql | undefined;
  try {
    await cluster.initialise();
    const config = join(clusterFolder, "cluster", "postgresql.conf");
    await writeFile(config, `${await readFile(config, "utf8")}\nlisten_addresses = '127.0.0.1'\n`);
    await cluster.start();
    await cluster.createDatabase("fictional_rehearsal_source");
    await cluster.createDatabase("formward_rehearsal_test");
    const base = `postgresql://postgres:fictional-rehearsal-password@127.0.0.1:${port}`;
    const sourceUrl = `${base}/fictional_rehearsal_source`, targetUrl = `${base}/formward_rehearsal_test`;
    source = postgres(sourceUrl, { max: 1, prepare: false, onnotice: () => {} });
    target = postgres(targetUrl, { max: 1, prepare: false, onnotice: () => {} });
    await source.unsafe(`
      CREATE TABLE public.users (id text PRIMARY KEY, password text NOT NULL, role text NOT NULL, banned boolean NOT NULL, access_version integer NOT NULL);
      CREATE TABLE public.records (id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id), value numeric(24,12), discarded text, happened_at timestamptz NOT NULL, metadata jsonb, tags text[], CONSTRAINT positive_value CHECK (value IS NULL OR value >= 0));
      ALTER TABLE public.records DROP COLUMN discarded;
      CREATE INDEX records_happened ON public.records (happened_at);
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint NOT NULL);
      INSERT INTO public.users VALUES ('fixture','fictional-password-hash','owner',true,7);
      INSERT INTO public.records(user_id,value,happened_at,metadata,tags) VALUES ('fixture',123456789.123456789012,'2026-10-30 00:00:00.123456+00','{"null":null,"number":12345678901234567890}',ARRAY['虚构','alpha']),('fixture',NULL,'2026-10-30 00:00:00.654321+00',NULL,NULL);
      INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('fictional-migration-hash',1793259334127);
    `);
    const diagnostic = join(outputFolder, "fictional-tool-diagnostic.txt");
    const shellQuote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;
    const pgDump = join(outputFolder, "pg-dump"), pgRestore = join(outputFolder, "pg-restore");
    await writeFile(diagnostic, "", { mode: 0o600 });
    for (const [wrapper, binary] of [[pgDump, process.env.FORMWARD_PG_DUMP || "/usr/lib/postgresql/18/bin/pg_dump"], [pgRestore, process.env.FORMWARD_PG_RESTORE || "/usr/lib/postgresql/18/bin/pg_restore"]]) {
      await writeFile(wrapper, `#!/bin/sh\nexec ${shellQuote(binary)} "$@" 2>>${shellQuote(diagnostic)}\n`, { mode: 0o700 });
    }
    const options = { sourceUrl, targetUrl, archivePath: join(outputFolder, "complete.dump"), execute: false, pgDump, pgRestore };

    await t.test("dry-run 不创建归档、不改空目标库", async () => {
      const result = await rehearseDatabase(options); assert.equal(result.passed, true);
      await assert.rejects(stat(options.archivePath), { code: "ENOENT" });
      assert.equal((await target!`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'`)[0].count, 0);
    });
    await t.test("导出与摘要使用同一快照，保留微秒、numeric、密码和撤销字段", async () => {
      const result = await rehearseDatabase({ ...options, execute: true, progress: async stage => {
        if (stage === "snapshot-exported") await source!`INSERT INTO public.users VALUES ('after-snapshot','another-fictional-hash','user',false,0)`;
      } }).catch(async error => { console.error("仅虚构测试库的工具诊断：", await readFile(diagnostic, "utf8")); throw error; });
      assert.equal(result.passed, true);
      assert.equal((await source!`SELECT count(*)::int AS count FROM public.users`)[0].count, 2);
      assert.equal((await target!`SELECT count(*)::int AS count FROM public.users`)[0].count, 1);
      const [record] = await target!`SELECT value::text AS value,to_char(happened_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US') AS time FROM public.records WHERE id=1`;
      assert.equal(record.value, "123456789.123456789012"); assert.equal(record.time, "2026-10-30 00:00:00.123456");
      const [user] = await target!`SELECT password,role,banned,access_version FROM public.users`;
      assert.deepEqual({ ...user }, { password: "fictional-password-hash", role: "owner", banned: true, access_version: 7 });
      // 复核兼容早期物理 attnum 摘要，不覆盖首次报告，也不再次恢复已非空的目标。
      const originalReport = await readFile(join(outputFolder, "complete.verification.json"), "utf8");
      const legacy = JSON.parse(await readFile(join(outputFolder, "complete.manifest.json"), "utf8"));
      legacy.snapshot.columns = legacy.snapshot.columns.map((text: string) => {
        const column = JSON.parse(text);
        if (column.table === "records" && column.position >= 4) column.position++;
        return JSON.stringify(column);
      });
      await copyFile(options.archivePath, join(outputFolder, "legacy.dump"));
      await writeFile(join(outputFolder, "legacy.manifest.json"), JSON.stringify(legacy), { mode: 0o600 });
      const verified = await verifyRestoredDatabase({ targetUrl, manifestPath: join(outputFolder, "legacy.manifest.json"), reportPath: join(outputFolder, "reverified.verification.json") });
      assert.equal(verified.passed, true); assert.equal(verified.sourceConnected, false); assert.equal(verified.targetReadOnly, true);
      assert.equal(await readFile(join(outputFolder, "complete.verification.json"), "utf8"), originalReport);
      await assert.rejects(verifyRestoredDatabase({ targetUrl, manifestPath: join(outputFolder, "legacy.manifest.json"), reportPath: join(outputFolder, "complete.verification.json") }), /拒绝覆盖/);
      await writeFile(join(outputFolder, "legacy.dump"), "fictional damaged archive");
      await assert.rejects(verifyRestoredDatabase({ targetUrl, manifestPath: join(outputFolder, "legacy.manifest.json"), reportPath: join(outputFolder, "tampered.verification.json") }), /SHA256/);
      assert.equal((await target!`SELECT nextval('public.records_id_seq')::text AS value`)[0].value, "3");
      for (const suffix of ["dump", "manifest.json", "verification.json"]) assert.equal((await stat(join(outputFolder, `complete.${suffix}`))).mode & 0o777, 0o600);
    });
    await t.test("已有目标数据时拒绝，不覆盖已有归档", async () => {
      await assert.rejects(rehearseDatabase({ ...options, archivePath: join(outputFolder, "nonempty.dump"), execute: true }), /目标库必须为空/);
      await assert.rejects(rehearseDatabase({ ...options, execute: true }), /输出文件已存在/);
      await assert.rejects(stat(join(outputFolder, "nonempty.dump")), { code: "ENOENT" });
      assert.equal((await target!`SELECT count(*)::int AS count FROM public.users`)[0].count, 1);
    });
    await t.test("归档路径不得离开私有导出目录", async () => {
      await assert.rejects(rehearseDatabase({ ...options, archivePath: resolve("public/fictional.dump"), execute: true }), /私有 data\/exports/);
    });
  } finally {
    await Promise.allSettled([source?.end(), target?.end()]);
    await cluster.stop();
    await rm(clusterFolder, { recursive: true, force: true });
    await rm(outputFolder, { recursive: true, force: true });
  }
});
