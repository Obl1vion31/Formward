import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";

test("0027 升级保留既有身份、密码、会话与 AI 授权，新增字段只采用安全默认值", async () => {
  const pg = new PGlite();
  try {
    for (const file of (await readdir("drizzle")).filter(file => /^\d{4}_.*\.sql$/.test(file) && Number(file.slice(0, 4)) < 27).sort()) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    const password = await hashPassword("fictional-existing-password");
    await pg.exec("INSERT INTO users(id,name,email,email_verified) VALUES ('legacy','虚构用户','legacy@example.test',false)");
    await pg.query("INSERT INTO accounts(id,user_id,account_id,provider_id,password) VALUES ('legacy-credential','legacy','legacy','credential',$1)", [password]);
    await pg.exec("INSERT INTO sessions(id,user_id,token,expires_at) VALUES ('legacy-session','legacy','fictional-session-token',now()+interval '1 day'); INSERT INTO ai_tokens(id,user_id,name,token_hash,prefix,permission,expires_at) VALUES ('legacy-token','legacy','虚构令牌','fictional-irreversible-digest','fw_ai_test','read',now()+interval '1 day')");
    const before = new Map<string, Record<string, unknown>[]>();
    for (const table of ["users", "accounts", "sessions", "ai_tokens"]) before.set(table, (await pg.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY id`)).rows);
    await pg.exec(await readFile("drizzle/0027_account_management.sql", "utf8"));
    for (const [table, rows] of before) {
      const after = (await pg.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY id`)).rows;
      assert.equal(after.length, rows.length);
      for (let index = 0; index < rows.length; index++) for (const [key, value] of Object.entries(rows[index])) assert.deepEqual(after[index][key], value, `${table}.${key}`);
    }
    const current = (await pg.query<Record<string, unknown>>("SELECT * FROM users WHERE id='legacy'")).rows[0];
    assert.equal(current.role, "user"); assert.equal(current.banned, false); assert.equal(current.access_version, 0); assert.equal(current.last_login_at, null);
    const session = (await pg.query<Record<string, unknown>>("SELECT * FROM sessions WHERE id='legacy-session'")).rows[0];
    assert.equal(session.admin_verified_at, null); assert.equal(session.access_version, 0);
    assert.equal((await pg.query("SELECT * FROM account_links")).rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM account_events")).rows.length, 0);
  } finally { await pg.close(); }
});
