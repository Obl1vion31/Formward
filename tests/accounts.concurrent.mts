import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { createAuth, currentUser } from "../src/features/auth/auth";
import { claimAccountLink, createAccountInvitation, initializeAccountOwner, manageAccount, unlockAccountAdmin } from "../src/features/auth/account-management";
import { webSessionContext } from "../src/features/auth/account-security";
import { lockOwner } from "../src/features/auth/owner-lock";

// 仅启动独立本机 PostgreSQL，完全不读取 .env.local 或外部数据库连接。
const modulePath = process.env.FORMWARD_EMBEDDED_POSTGRES_MODULE ?? "/tmp/formward-account-tooling/node_modules/embedded-postgres/dist/index.js";
const { default: EmbeddedPostgres } = await import(pathToFileURL(modulePath).href);
const folder = await mkdtemp(join(tmpdir(), "formward-account-concurrency-"));
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const address = probe.address(); assert.ok(address && typeof address === "object");
const port = address.port; await new Promise<void>(resolve => probe.close(() => resolve()));
const cluster = new EmbeddedPostgres({ databaseDir: join(folder, "cluster"), user: "postgres", password: "fictional-postgres-password", port, persistent: false, onLog: () => {}, onError: () => {} });
let database: ReturnType<typeof createDatabase> | undefined, blocker: ReturnType<typeof postgres> | undefined;
const checks: string[] = [];
try {
  await cluster.initialise();
  // 明确只监听回环地址，不依赖发行版默认监听配置。
  const configPath = join(folder, "cluster", "postgresql.conf");
  await writeFile(configPath, `${await readFile(configPath, "utf8")}\nlisten_addresses = '127.0.0.1'\n`);
  await cluster.start(); await cluster.createDatabase("formward_account_concurrency");
  const url = `postgresql://postgres:fictional-postgres-password@127.0.0.1:${port}/formward_account_concurrency`;
  database = createDatabase(`${url}?max=6`); blocker = postgres(url, { max: 1, prepare: false });
  const db = database.db, sql = database.db.$client;
  await migrate(db, { migrationsFolder: "./drizzle" });
  const baseURL = "http://localhost:3000", auth = createAuth(db, { secret: "fictional-concurrency-auth-secret-more-than-32", baseURL, rateLimit: false });
  const owner = await provisionAccount(db, { email: "owner@concurrency.example.test", password: "fictional-owner-password" });
  await initializeAccountOwner(db, owner.id);
  async function login(email: string, password = "fictional-person-password") {
    return auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  }
  async function proof(response: Response) {
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const identity = await auth.api.getSession({ headers: new Headers({ cookie }) }); assert.ok(identity);
    return { userId: identity.user.id, sessionId: identity.session.id, accessVersion: identity.session.accessVersion };
  }
  const ownerProof = await proof(await login("owner@concurrency.example.test", "fictional-owner-password"));
  await unlockAccountAdmin(db, ownerProof, "fictional-owner-password", "concurrency");
  const invite = await createAccountInvitation(db, ownerProof, "invite@concurrency.example.test", randomUUID());
  const claims = await Promise.allSettled(Array.from({ length: 4 }, (_, index) => claimAccountLink(db, invite.rawToken!, "fictional-activation-password", `parallel-${index}`)));
  assert.equal(claims.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.email, "invite@concurrency.example.test"))).length, 1);
  checks.push("真实 PostgreSQL 四连接并发消费邀请，只成功一次");

  const person = await provisionAccount(db, { email: "race@concurrency.example.test", password: "fictional-person-password" });
  const personProof = await proof(await login("race@concurrency.example.test"));
  await sql.unsafe("CREATE FUNCTION account_test_pause_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(9847127); RETURN NEW; END $$");
  await sql.unsafe("CREATE TRIGGER account_test_pause_session BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION account_test_pause_session()");
  await blocker`SELECT pg_advisory_lock(9847127)`;
  const delayedLogin = login("race@concurrency.example.test");
  let waiting = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = await sql`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
    if (rows.length) { waiting = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(waiting, "登录应已验证旧密码并阻塞在会话插入");
  const reset = await manageAccount(db, ownerProof, person.id, "reset_password", "", randomUUID());
  await claimAccountLink(db, reset!.rawToken!, "fictional-changed-password", "race-reset");
  await blocker`SELECT pg_advisory_unlock(9847127)`;
  const staleResponse = await delayedLogin;
  assert.equal(staleResponse.status, 401);
  const staleCookie = staleResponse.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.equal(await currentUser(new Headers({ cookie: staleCookie }), auth), null);
  await sql.unsafe("DROP TRIGGER account_test_pause_session ON sessions");
  await sql.unsafe("DROP FUNCTION account_test_pause_session()");
  checks.push("旧密码已通过验证、会话延迟插入时重设密码，旧版本会话仍不可用");

  // 原请求凭据已通过身份检查，但到写事务时再复核，不能越过撤销。
  const freshProof = await proof(await login("race@concurrency.example.test", "fictional-changed-password"));
  let held!: () => void, release!: () => void;
  const hasLock = new Promise<void>(resolve => { held = resolve; }), releaseLock = new Promise<void>(resolve => { release = resolve; });
  const lock = blocker.begin(async tx => { await tx`SELECT id FROM users WHERE id=${person.id} FOR UPDATE`; held(); await releaseLock; });
  await hasLock;
  const revoke = manageAccount(db, ownerProof, person.id, "revoke_access", "", randomUUID());
  // 等撤销已排队等待账号行锁，再发出较晚的保存请求。
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await sql`SELECT 1 FROM pg_stat_activity WHERE datname='formward_account_concurrency' AND wait_event_type='Lock'`;
    if (rows.length) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  let wrote = false;
  const delayedWrite = webSessionContext.run(freshProof, () => db.transaction(async tx => { await lockOwner(tx, person.id); wrote = true; }));
  const writeOutcome = delayedWrite.then(() => false, () => true);
  release(); await lock; await revoke;
  assert.equal(await writeOutcome, true); assert.equal(wrote, false);
  await assert.rejects(webSessionContext.run(personProof, () => db.transaction(tx => lockOwner(tx, person.id))), /登录已失效/);
  checks.push("真实行锁竞争下，排在访问撤销之后的在途网页保存被拒绝");
  console.log(JSON.stringify({ passed: checks, postgres: "isolated loopback", productionAccess: false }, null, 2));
} finally {
  if (blocker) { await blocker`SELECT pg_advisory_unlock_all()`.catch(() => {}); await blocker.end(); }
  await database?.close(); await cluster.stop();
}
