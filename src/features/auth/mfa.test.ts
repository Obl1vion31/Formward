import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createAuth } from "./auth";
import { provisionAccount } from "./provision";
import { initializeAccountOwner } from "./account-management";
import { requireSessionProof } from "./account-security";
import { unlockAccountAdmin } from "./account-management";
import * as schema from "../../db/schema";

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", bits = [...secret.toUpperCase().replace(/=/g, "")].map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest(), offset = hash.at(-1)! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
test("MFA绑定、错码、登录挑战、恢复码及撤销边界使用真实官方插件", async () => {
  const previous = process.env.FORMWARD_TEST_OWNER_MFA; process.env.FORMWARD_TEST_OWNER_MFA = "1";
  const pg = new PGlite(), db = drizzle(pg, { schema }), password = "fictional-mfa-password-safe";
  const cookies = new Map<string, string>(), origin = "http://localhost:3100";
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    const owner = await provisionAccount(db, { email: "mfa-owner@example.test", password }); await initializeAccountOwner(db, owner.id);
    const auth = createAuth(db, { secret: "fictional-mfa-encryption-secret-at-least-32", baseURL: origin, rateLimit: false });
    async function request(path: string, body?: object) {
      const response = await auth.handler(new Request(origin + "/api/auth/" + path, { method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json", Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; ") }, ...(body ? { body: JSON.stringify(body) } : {}) }));
      for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], i = pair.indexOf("="); if (/Max-Age=0/i.test(cookie)) cookies.delete(pair.slice(0, i)); else cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      return response;
    }
    const login = await request("sign-in/email", { email: "mfa-owner@example.test", password }); assert.equal(login.status, 200);
    const initial = await (await request("get-session")).json(); assert.ok(initial.session);
    const proof = { userId: owner.id, sessionId: initial.session.id, accessVersion: initial.session.accessVersion };
    await assert.rejects(requireSessionProof(db, proof), /绑定验证器/);
    const enabled = await request("two-factor/enable", { password }); assert.equal(enabled.status, 200);
    const setup = await enabled.json(), secret = new URL(setup.totpURI).searchParams.get("secret")!;
    assert.equal(setup.backupCodes.length, 10);
    assert.equal((await request("two-factor/verify-totp", { code: "invalid" })).status, 401);
    const [unverified] = await db.select().from(schema.session).where(eq(schema.session.id, proof.sessionId)); assert.equal(unverified.securityVerifiedAt?.getTime(), initial.session.securityVerifiedAt ? Date.parse(initial.session.securityVerifiedAt) : unverified.securityVerifiedAt?.getTime()); assert.equal(unverified.mfaVerifiedAt, null);
    const confirmed = await request("two-factor/verify-totp", { code: totp(secret) }); assert.equal(confirmed.status, 200);
    const full = await (await request("get-session")).json();
    const verified = await requireSessionProof(db, { userId: owner.id, sessionId: full.session.id, accessVersion: full.session.accessVersion }); assert.ok(verified.session.mfaVerifiedAt);
    assert.equal((await request("two-factor/view-backup-codes", { password })).status, 404);
    assert.equal((await request("two-factor/disable", { password })).status, 403);
    const [factor] = await db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, owner.id)); assert.ok(!factor.secret.includes(secret)); assert.ok(!factor.backupCodes.includes(setup.backupCodes[0]));
    await request("sign-out", {}); cookies.clear();
    const second = await request("sign-in/email", { email: "mfa-owner@example.test", password }); assert.equal(second.status, 200); assert.equal((await second.json()).twoFactorRedirect, true);
    assert.equal(await (await request("get-session")).json(), null);
    const recovered = await request("two-factor/verify-backup-code", { code: setup.backupCodes[0] }); assert.equal(recovered.status, 200);
    const recoveredSession = await (await request("get-session")).json();
    await assert.rejects(requireSessionProof(db, { userId: owner.id, sessionId: recoveredSession.session.id, accessVersion: recoveredSession.session.accessVersion }), /重新绑定/);
    await request("sign-out", {}); cookies.clear();
    await request("sign-in/email", { email: "mfa-owner@example.test", password });
    assert.notEqual((await request("two-factor/verify-backup-code", { code: setup.backupCodes[0] })).status, 200);
    // 访问版本变更后，即使保留原挑战和正确动态码也不能签发有效会话。
    await db.update(schema.user).set({ accessVersion: 1 }).where(eq(schema.user.id, owner.id));
    assert.equal((await request("two-factor/verify-totp", { code: totp(secret) })).status, 401);
  } finally { await pg.close(); if (previous === undefined) delete process.env.FORMWARD_TEST_OWNER_MFA; else process.env.FORMWARD_TEST_OWNER_MFA = previous; }
});

test("管理员临时密码模式仍校验密码、角色、会话与五分钟期限，普通用户MFA不受影响", async () => {
  const previousFlag=process.env.FORMWARD_OWNER_MFA_REQUIRED, previousForce=process.env.FORMWARD_TEST_OWNER_MFA;
  process.env.FORMWARD_TEST_OWNER_MFA="1";delete process.env.FORMWARD_OWNER_MFA_REQUIRED;
  const pg=new PGlite(),db=drizzle(pg,{schema}),password="fictional-owner-password-only";
  try{
    await migrate(db,{migrationsFolder:"drizzle"});
    const owner=await provisionAccount(db,{email:"owner-pause@example.test",password});await initializeAccountOwner(db,owner.id);
    const auth=createAuth(db,{secret:"fictional-owner-pause-secret-at-least-32",baseURL:"http://localhost:3100",rateLimit:false});
    const login=await auth.handler(new Request("http://localhost:3100/api/auth/sign-in/email",{method:"POST",headers:{Origin:"http://localhost:3100","Content-Type":"application/json"},body:JSON.stringify({email:"owner-pause@example.test",password})}));assert.equal(login.status,200);
    const cookies=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    const current=await(await auth.handler(new Request("http://localhost:3100/api/auth/get-session",{headers:{Cookie:cookies}}))).json();
    const proof={userId:owner.id,sessionId:current.session.id,accessVersion:0};
    await assert.rejects(requireSessionProof(db,proof),/绑定验证器/);
    process.env.FORMWARD_OWNER_MFA_REQUIRED="0";
    await requireSessionProof(db,proof);
    await assert.rejects(requireSessionProof(db,proof,true),/再次输入密码/);
    await assert.rejects(unlockAccountAdmin(db,proof,"wrong-password","fictional-pause"),/密码不正确/);
    await unlockAccountAdmin(db,proof,password,"fictional-pause");await requireSessionProof(db,proof,true);
    const blocked=await auth.handler(new Request("http://localhost:3100/api/auth/two-factor/enable",{method:"POST",headers:{Origin:"http://localhost:3100","Content-Type":"application/json",Cookie:cookies},body:JSON.stringify({password})}));assert.equal(blocked.status,403);
    await db.update(schema.session).set({adminVerifiedAt:new Date(Date.now()-300001)}).where(eq(schema.session.id,proof.sessionId));await assert.rejects(requireSessionProof(db,proof,true),/再次输入密码/);
    const ordinary=await provisionAccount(db,{email:"ordinary-pause@example.test",password});
    await db.update(schema.user).set({role:"user"}).where(eq(schema.user.id,owner.id));await assert.rejects(requireSessionProof(db,proof,true),/没有管理权限/);
    await db.update(schema.user).set({twoFactorEnabled:true}).where(eq(schema.user.id,owner.id));await assert.rejects(requireSessionProof(db,proof),/动态码验证/);
    await assert.rejects(requireSessionProof(db,{...proof,userId:ordinary.id}),/登录已失效/);
    await db.update(schema.user).set({banned:true}).where(eq(schema.user.id,owner.id));await assert.rejects(requireSessionProof(db,proof),/账号访问已失效/);
  }finally{await pg.close();if(previousFlag===undefined)delete process.env.FORMWARD_OWNER_MFA_REQUIRED;else process.env.FORMWARD_OWNER_MFA_REQUIRED=previousFlag;if(previousForce===undefined)delete process.env.FORMWARD_TEST_OWNER_MFA;else process.env.FORMWARD_TEST_OWNER_MFA=previousForce;}
});
