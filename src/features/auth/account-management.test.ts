import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { createAuth, currentUser } from "./auth";
import { provisionAccount } from "./provision";
import { claimAccountLink, createAccountInvitation, initializeAccountOwner, inspectAccountLink, loadAccountAdmin, manageAccount, recoverAccountOwner, revokeAccountInvitation, unlockAccountAdmin, changePersonalPassword, loadPersonalAccount, revokePersonalAccess, revokePersonalSession } from "./account-management";
import { ADMIN_VERIFICATION_MS, hashAccountToken, requireSessionProof, webSessionContext } from "./account-security";
import { createAiToken, authenticateAi } from "./ai-tokens";
import { lockOwner } from "./owner-lock";

const pg = new PGlite(), db = drizzle(pg, { schema });
const baseURL = "http://localhost:3000", ownerPassword = "fictional-owner-password";
let auth: ReturnType<typeof createAuth>, ownerId: string, serial = 0;
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  auth = createAuth(db, { secret: "fictional-account-tests-secret-more-than-32", baseURL, rateLimit: false });
  ownerId = (await provisionAccount(db, { email: "owner@account.example.test", password: ownerPassword })).id;
  await initializeAccountOwner(db, ownerId);
});
after(async () => { await pg.close(); });

async function signIn(email: string, password: string) {
  const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { response, cookie };
}
async function ownerProof(verified = true) {
  const { response, cookie } = await signIn("owner@account.example.test", ownerPassword);
  assert.equal(response.status, 200);
  const identity = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(identity);
  if (verified) await db.update(schema.session).set({ adminVerifiedAt: new Date() }).where(eq(schema.session.id, identity.session.id));
  return { userId: ownerId, sessionId: identity.session.id, accessVersion: identity.session.accessVersion };
}
async function ordinary() {
  const email = `person-${++serial}@account.example.test`, password = "fictional-person-password";
  const { id } = await provisionAccount(db, { email, password });
  const { response, cookie } = await signIn(email, password);
  assert.equal(response.status, 200);
  const identity = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(identity);
  return { id, email, password, cookie, proof: { userId: id, sessionId: identity.session.id, accessVersion: identity.session.accessVersion } };
}

test("owner 初始化只认明确已有账号，重复安全，不能增设第二个 owner", async () => {
  await initializeAccountOwner(db, ownerId);
  const person = await ordinary();
  await assert.rejects(initializeAccountOwner(db, person.id), /已经存在 owner/);
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.id, person.id)))[0].role, "user");
});

test("管理读取拒绝普通用户、未验密、过期、跨会话与伪造版本", async () => {
  const person = await ordinary();
  await assert.rejects(loadAccountAdmin(db, person.proof), /管理权限/);
  const proof = await ownerProof(false);
  await assert.rejects(loadAccountAdmin(db, proof), /再次输入密码/);
  await unlockAccountAdmin(db, proof, ownerPassword, "unlock-test");
  assert.ok((await loadAccountAdmin(db, proof)).total >= 2);
  await assert.rejects(loadAccountAdmin(db, await ownerProof(false)), /再次输入密码/);
  await assert.rejects(loadAccountAdmin(db, { ...proof, accessVersion: -1 }), /登录已失效/);
  await db.update(schema.session).set({ adminVerifiedAt: new Date(Date.now() - ADMIN_VERIFICATION_MS) }).where(eq(schema.session.id, proof.sessionId));
  await assert.rejects(loadAccountAdmin(db, proof), /再次输入密码/);
});

test("再次验密按账号与来源共享限流，错误密码不解锁", async () => {
  const proof = await ownerProof(false);
  await db.delete(schema.rateLimit);
  for (let index = 0; index < 5; index++) await assert.rejects(unlockAccountAdmin(db, proof, "wrong-password", `source-${index}`), /密码不正确/);
  await assert.rejects(unlockAccountAdmin(db, proof, ownerPassword, "different-source"), /一分钟/);
  assert.equal((await db.select().from(schema.session).where(eq(schema.session.id, proof.sessionId)))[0].adminVerifiedAt, null);
  await db.delete(schema.rateLimit);
});

test("邀请只存摘要与邀请，不提前建账号；预览不消费；激活不验证邮箱", async () => {
  const proof = await ownerProof(), email = "invited@account.example.test", request = randomUUID();
  const link = await createAccountInvitation(db, proof, email, request);
  assert.ok(link.rawToken);
  const [stored] = await db.select().from(schema.accountLink).where(eq(schema.accountLink.email, email));
  assert.equal(stored.tokenHash, hashAccountToken(link.rawToken));
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.email, email))).length, 0);
  for (let i = 0; i < 2; i++) assert.equal((await inspectAccountLink(db, link.rawToken)).email, email);
  const repeat = await createAccountInvitation(db, proof, email, request);
  assert.equal(repeat.repeated, true); assert.equal(repeat.rawToken, null);
  await claimAccountLink(db, link.rawToken, "fictional-invited-password", "claim-test");
  const [created] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  assert.equal(created.emailVerified, false); assert.equal(created.role, "user");
  assert.equal((await signIn(email, "fictional-invited-password")).response.status, 200);
  await assert.rejects(claimAccountLink(db, link.rawToken, "fictional-new-password", "claim-test"), /失效或已使用/);
});

test("邀请重新生成、撤销与过期即时失效，已有账号不被覆盖", async () => {
  const proof = await ownerProof(), email = "replace@account.example.test";
  const old = await createAccountInvitation(db, proof, email, randomUUID());
  const fresh = await createAccountInvitation(db, proof, email, randomUUID());
  await assert.rejects(inspectAccountLink(db, old.rawToken!), /失效/);
  const [row] = await db.select().from(schema.accountLink).where(eq(schema.accountLink.tokenHash, hashAccountToken(fresh.rawToken!)));
  await revokeAccountInvitation(db, proof, row.id, randomUUID());
  await assert.rejects(inspectAccountLink(db, fresh.rawToken!), /失效/);
  const expired = await createAccountInvitation(db, proof, email, randomUUID());
  await db.update(schema.accountLink).set({ expiresAt: new Date(0) }).where(eq(schema.accountLink.tokenHash, hashAccountToken(expired.rawToken!)));
  await assert.rejects(claimAccountLink(db, expired.rawToken!, "fictional-new-password", "expired"), /失效/);
  const person = await ordinary();
  await assert.rejects(createAccountInvitation(db, proof, person.email, randomUUID()), /账号已存在/);
  assert.equal((await signIn(person.email, person.password)).response.status, 200);
});

test("邀请并发消费只创建一个账号和一次成功审计", async () => {
  const link = await createAccountInvitation(db, await ownerProof(), "parallel@account.example.test", randomUUID());
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => claimAccountLink(db, link.rawToken!, "fictional-new-password", "parallel")));
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.email, "parallel@account.example.test"))).length, 1);
});

test("密码重设在兑换前保留访问，成功后撤销全部访问和其他链接", async () => {
  const proof = await ownerProof(), person = await ordinary();
  const token = await createAiToken(db, person.id, "测试", "write");
  const link = await manageAccount(db, proof, person.id, "reset_password", "", randomUUID());
  assert.ok(link?.rawToken);
  assert.ok(await currentUser(new Headers({ cookie: person.cookie }), auth));
  assert.ok(await authenticateAi(db, `Bearer ${token.rawToken}`));
  await claimAccountLink(db, link.rawToken, "fictional-replacement-password", "reset");
  assert.equal(await currentUser(new Headers({ cookie: person.cookie }), auth), null);
  await assert.rejects(authenticateAi(db, `Bearer ${token.rawToken}`), /撤销/);
  assert.equal((await signIn(person.email, person.password)).response.status, 401);
  assert.equal((await signIn(person.email, "fictional-replacement-password")).response.status, 200);
});

test("停用／恢复保持数据；恢复不复活旧会话、令牌或重设链接", async () => {
  const proof = await ownerProof(), person = await ordinary();
  const token = await createAiToken(db, person.id, "测试", "write");
  const link = await manageAccount(db, proof, person.id, "reset_password", "", randomUUID());
  await manageAccount(db, proof, person.id, "suspend", "内部停用样本", randomUUID());
  assert.equal((await signIn(person.email, person.password)).response.status, 403);
  await assert.rejects(authenticateAi(db, `Bearer ${token.rawToken}`));
  await manageAccount(db, proof, person.id, "restore", "", randomUUID());
  assert.equal((await signIn(person.email, person.password)).response.status, 200);
  assert.equal(await currentUser(new Headers({ cookie: person.cookie }), auth), null);
  await assert.rejects(inspectAccountLink(db, link!.rawToken!), /失效/);
  await assert.rejects(authenticateAi(db, `Bearer ${token.rawToken}`), /撤销/);
  assert.ok((await db.select().from(schema.user).where(eq(schema.user.id, person.id)))[0]);
});

test("后台不能停用或重设 owner，不能无原因停用，重复请求幂等", async () => {
  const proof = await ownerProof(), person = await ordinary();
  for (const command of ["suspend", "restore", "revoke_access", "reset_password"] as const) await assert.rejects(manageAccount(db, proof, ownerId, command, "测试", randomUUID()), /普通用户/);
  await assert.rejects(manageAccount(db, proof, person.id, "suspend", "", randomUUID()), /停用原因/);
  const request = randomUUID();
  await manageAccount(db, proof, person.id, "revoke_access", "", request);
  const first = (await db.select().from(schema.user).where(eq(schema.user.id, person.id)))[0].accessVersion;
  await manageAccount(db, proof, person.id, "revoke_access", "", request);
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.id, person.id)))[0].accessVersion, first);
  await assert.rejects(manageAccount(db, proof, person.id, "restore", "", request), /另一项操作/);
});

test("所有内置管理／改密入口对 HTTP 和 auth.api 调用都关闭", async () => {
  const proof = await ownerProof();
  for (const path of ["admin/list-users", "admin/create-user", "admin/set-role", "admin/ban-user", "admin/set-user-password", "admin/remove-user", "change-password", "set-password", "reset-password", "update-user", "revoke-sessions"]) {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/${path}`, { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: "{}" }));
    assert.equal(response.status, 404, path);
  }
  await assert.rejects(auth.api.setRole({ headers: new Headers(), body: { userId: proof.userId, role: "owner" } }));
});

test("普通用户可管理自己的设备，跨账号设备操作失败", async () => {
  const first = await ordinary(), second = await ordinary();
  const data = await loadPersonalAccount(db, first.proof);
  assert.ok(data.devices.some(row => row.id === first.proof.sessionId));
  await assert.rejects(revokePersonalSession(db, first.proof, second.proof.sessionId), /不存在/);
  await revokePersonalSession(db, first.proof, first.proof.sessionId);
  await assert.rejects(loadPersonalAccount(db, first.proof), /登录已失效/);
});

test("修改密码校验旧密码与新长度，成功后撤销访问；六位旧密码继续可登录", async () => {
  const person = await ordinary();
  await assert.rejects(changePersonalPassword(db, person.proof, "wrong", "fictional-new-password", "own-change"), /当前密码/);
  await assert.rejects(changePersonalPassword(db, person.proof, person.password, "short", "own-change"), /12–128/);
  await changePersonalPassword(db, person.proof, person.password, "fictional-new-password", "own-change");
  assert.equal(await currentUser(new Headers({ cookie: person.cookie }), auth), null);
  assert.equal((await signIn(person.email, "fictional-new-password")).response.status, 200);
  const old = await provisionAccount(db, { email: "six@account.example.test", password: "123456" });
  assert.ok(old.id); assert.equal((await signIn("six@account.example.test", "123456")).response.status, 200);
});

test("在途网页写入和延迟旧版本会话在全部撤销后被拒绝", async () => {
  const person = await ordinary();
  await revokePersonalAccess(db, person.proof, person.password, "revoke-self");
  await assert.rejects(webSessionContext.run(person.proof, () => db.transaction(tx => lockOwner(tx, person.id))), /登录已失效/);
  const id = randomUUID();
  await db.insert(schema.session).values({ id, userId: person.id, token: randomUUID(), accessVersion: person.proof.accessVersion, expiresAt: new Date(Date.now() + 60000) });
  await assert.rejects(requireSessionProof(db, { ...person.proof, sessionId: id }), /登录已失效/);
});

test("owner 本地恢复撤销访问而不改健康数据，普通账号不可用恢复工具", async () => {
  const person = await ordinary();
  await assert.rejects(recoverAccountOwner(db, person.id, "fictional-recovery-password"), /owner/);
  const proof = await ownerProof();
  await recoverAccountOwner(db, ownerId, ownerPassword);
  await assert.rejects(loadAccountAdmin(db, proof), /登录已失效/);
});

test("激活审计失败时账号、密码与令牌消费全部回滚", async () => {
  const proof = await ownerProof(), email = "rollback@account.example.test";
  const link = await createAccountInvitation(db, proof, email, randomUUID());
  await pg.exec("CREATE FUNCTION account_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invite_claimed' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER account_fail_audit BEFORE INSERT ON account_events FOR EACH ROW EXECUTE FUNCTION account_fail_audit();");
  try {
    await assert.rejects(claimAccountLink(db, link.rawToken!, "fictional-new-password", "rollback"));
    assert.equal((await db.select().from(schema.user).where(eq(schema.user.email, email))).length, 0);
    assert.equal((await inspectAccountLink(db, link.rawToken!)).email, email);
  } finally { await pg.exec("DROP TRIGGER account_fail_audit ON account_events; DROP FUNCTION account_fail_audit();"); }
});
