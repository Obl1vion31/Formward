import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { createDatabase } from "../src/db/client";
import { createAuth, getAuth } from "../src/features/auth/auth";
import { provisionAccount } from "../src/features/auth/provision";
import { verifyImageUploadTicket } from "../src/features/meals/image-upload";
import { POST } from "../src/app/api/meal-images/upload/route";

// 运行实际Route Handler和认证／数据库逻辑，网络地址及文件均为虚构；不调用Blob。
const pg = new PGlite(), db = drizzle(pg, { schema });
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
const shared = globalThis as typeof globalThis & {
  formwardAuth?: ReturnType<typeof createAuth>;
  formwardDatabase?: ReturnType<typeof createDatabase>;
};
assert.ok(!Object.hasOwn(shared, "formwardDatabase"), "须在独立测试进程运行");
assert.ok(!Object.hasOwn(shared, "formwardAuth"), "须在独立测试进程运行");
const secret = "fictional-upload-origin-secret-more-than-32-characters";
const credentials = { email: "upload-origin@example.test", password: "fictional-upload-password" };
const file = { fileName: "fictional.png", size: 68, mimeType: "image/png", sha256: "a".repeat(64) };
const payload = JSON.stringify({ step: "prepare", file });
let checks = 0;

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const user = await provisionAccount(db, credentials);
  await socket.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`;
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BLOB_STORE_ID = "";
  process.env.BLOB_READ_WRITE_TOKEN = "";

  for (const baseURL of ["https://formward.example", "http://127.0.0.1:43123"]) {
    delete shared.formwardAuth;
    process.env.BETTER_AUTH_URL = baseURL;
    const auth = getAuth();
    const login = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.10" },
      body: JSON.stringify(credentials),
    }));
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.ok(cookie);

    for (const internalURL of ["http://127.0.0.1:3000/api/meal-images/upload", "https://internal.example/api/meal-images/upload"]) {
      const response = await POST(new Request(internalURL, {
        method: "POST", headers: { Origin: baseURL, Cookie: cookie, "Content-Type": "application/json", Host: new URL(baseURL).host },
        body: payload,
      }));
      assert.equal(response.status, 200, `${baseURL}经${new URL(internalURL).protocol}代理应允许上传准备`);
      const prepared = await response.json();
      assert.equal(verifyImageUploadTicket(prepared.ticket, user.id, secret).userId, user.id);
      checks++;
    }

    if (baseURL.startsWith("http:")) {
      const response = await POST(new Request("http://127.0.0.1:3000/api/meal-images/upload", {
        method: "POST", headers: { Origin: "http://localhost:43123", Cookie: cookie, "Content-Type": "application/json" }, body: payload,
      }));
      assert.equal(response.status, 200, "同端口localhost应兼容本机隧道");
      checks++;
    }

    const deniedOrigins = [undefined, "null", "https://attacker.example", "http://127.0.0.1:3000", "http://127.0.0.1:43124"];
    for (const origin of deniedOrigins) {
      const headers = new Headers({ Cookie: cookie, "Content-Type": "application/json", Host: "attacker.example", "X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "https" });
      if (origin !== undefined) headers.set("Origin", origin);
      const response = await POST(new Request("https://attacker.example/api/meal-images/upload", { method: "POST", headers, body: payload }));
      assert.equal(response.status, 403, `拒绝来源${origin ?? "缺失"}，即便请求URL与代理头被伪造`);
      checks++;
    }

    const anonymous = await POST(new Request("http://127.0.0.1:3000/api/meal-images/upload", {
      method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: payload,
    }));
    assert.equal(anonymous.status, 401, "可信来源不能替代登录身份");
    checks++;
  }
  assert.equal((await db.select().from(schema.mealImage)).length, 0, "prepare不登记图片或访问真实存储");
  console.log(`上传来源回归通过：${checks}项，包含HTTP／HTTPS反代、隧道、伪造来源及匿名拒绝。`);
} finally {
  await shared.formwardDatabase?.close();
  delete shared.formwardDatabase;
  delete shared.formwardAuth;
  await socket.stop();
  await pg.close();
}
