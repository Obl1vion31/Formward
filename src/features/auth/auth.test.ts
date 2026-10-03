import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { createAuth, currentUser } from "./auth";
import { provisionAccount } from "./provision";
import * as schema from "../../db/schema";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const baseURL = "http://localhost:3000";
const auth = createAuth(db, { secret: "fictional-test-secret-at-least-32-characters", baseURL, rateLimit: false });
const credentials = { email: "first@example.test", password: "fictional-password-first" };
const other = { email: "second@example.test", password: "fictional-password-second" };

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await provisionAccount(db, credentials);
  await provisionAccount(db, other);
});
after(async () => { await pg.close(); });

async function request(path: string, body?: object, cookie?: string, instance = auth, origin = baseURL) {
  return instance.handler(new Request(`${baseURL}/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}

async function login(input = credentials) {
  const response = await request("sign-in/email", input);
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.includes("HttpOnly") && /SameSite=lax/i.test(cookie)));
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

test("内部账号保存安全哈希，公开注册关闭", async () => {
  const [row] = await db.select().from(schema.account).where(eq(schema.account.accountId, (await db.select().from(schema.user).where(eq(schema.user.email, credentials.email)))[0].id));
  assert.notEqual(row.password, credentials.password);
  assert.ok(await verifyPassword({ hash: row.password!, password: credentials.password }));
  const response = await request("sign-up/email", { ...credentials, name: "测试" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "EMAIL_PASSWORD_SIGN_UP_DISABLED");
});

test("正常登录后能验证当前用户，未登录和伪造 cookie 无身份", async () => {
  const cookie = await login();
  assert.equal((await currentUser(new Headers({ cookie }), auth))?.email, credentials.email);
  assert.equal(await currentUser(new Headers(), auth), null);
  assert.equal(await currentUser(new Headers({ cookie: "formward.session_token=forged" }), auth), null);
});

test("错误密码、不存在账号和无效输入不会创建会话", async () => {
  const count = (await db.select().from(schema.session)).length;
  for (const body of [
    { ...credentials, password: "wrong-password" },
    { email: "missing@example.test", password: "fictional-password" },
    { email: "invalid", password: "fictional-password" },
    { email: credentials.email },
  ]) {
    const response = await request("sign-in/email", body);
    assert.ok(response.status === 400 || response.status === 401);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal((await db.select().from(schema.session)).length, count);
});

test("账号创建支持重复和并发请求，既不重复记录也不重置密码", async () => {
  const input = { email: "duplicate@example.test", password: "fictional-original-password" };
  const results = await Promise.all([provisionAccount(db, input), provisionAccount(db, { ...input, email: " DUPLICATE@EXAMPLE.TEST " })]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(results[0].id, results[1].id);
  await provisionAccount(db, { ...input, password: "fictional-replacement-password" });
  await login(input);
  assert.equal((await request("sign-in/email", { ...input, password: "fictional-replacement-password" })).status, 401);
});

test("每个 cookie 只映射自身账号，退出不会撤销其他账号会话", async () => {
  const firstCookie = await login();
  const secondCookie = await login(other);
  const result = await request("get-session?user_id=another-account", undefined, firstCookie);
  assert.equal((await result.json()).user.email, credentials.email);
  assert.equal((await currentUser(new Headers({ cookie: secondCookie }), auth))?.email, other.email);
  assert.equal((await request("sign-out", {}, firstCookie)).status, 200);
  assert.equal(await currentUser(new Headers({ cookie: firstCookie }), auth), null);
  assert.equal((await currentUser(new Headers({ cookie: secondCookie }), auth))?.email, other.email);
  assert.equal((await request("sign-out", {}, firstCookie)).status, 200, "重复退出是幂等的");
});

test("会话过期或数据库撤销后立即失效", async () => {
  const cookie = await login();
  const result = await request("get-session", undefined, cookie);
  const { session } = await result.json();
  await db.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id, session.id));
  assert.equal(await currentUser(new Headers({ cookie }), auth), null);
  const fresh = await login();
  const freshSession = (await (await request("get-session", undefined, fresh)).json()).session;
  await db.delete(schema.session).where(eq(schema.session.id, freshSession.id));
  assert.equal(await currentUser(new Headers({ cookie: fresh }), auth), null);
});

test("外部来源无法登录或退出；HTTPS 使用 Secure cookie", async () => {
  const cookie = await login();
  assert.equal((await request("sign-in/email", credentials, undefined, auth, "https://untrusted.example")).status, 403);
  assert.equal((await request("sign-out", {}, cookie, auth, "https://untrusted.example")).status, 403);
  assert.ok(await currentUser(new Headers({ cookie }), auth));
  const secure = createAuth(db, { secret: "fictional-test-secret-at-least-32-characters", baseURL: "https://formward.example", rateLimit: false });
  const response = await secure.handler(new Request("https://formward.example/api/auth/sign-in/email", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://formward.example" }, body: JSON.stringify(credentials),
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /; Secure/i);
});

test("无效账号创建输入不写入数据库，migration 可重复执行", async () => {
  const count = (await db.select().from(schema.user)).length;
  await assert.rejects(provisionAccount(db, { email: "invalid", password: "fictional-password" }));
  await assert.rejects(provisionAccount(db, { email: "invalid@example.test", password: "short" }));
  assert.equal((await db.select().from(schema.user)).length, count);
  await migrate(db, { migrationsFolder: "./drizzle" });
  assert.equal((await db.select().from(schema.user)).length, count);
});

test("登录限流阻止同一来源在一分钟内连续尝试超过五次", async () => {
  const limited = createAuth(db, { secret: "fictional-test-secret-at-least-32-characters", baseURL });
  for (let i = 0; i < 5; i++) {
    const response = await limited.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL, "x-forwarded-for": "192.0.2.99" },
      body: JSON.stringify({ ...credentials, password: "wrong-password" }),
    }));
    assert.equal(response.status, 401);
  }
  const response = await limited.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL, "x-forwarded-for": "192.0.2.99" }, body: JSON.stringify(credentials),
  }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("x-retry-after")) > 0);
});
