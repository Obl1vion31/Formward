import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { deflateSync } from "node:zlib";
import COS from "cos-nodejs-sdk-v5";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import * as schema from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { lockOwner } from "../src/features/auth/owner-lock";
import { revokeAccountAccess } from "../src/features/auth/account-security";
import { createAiToken, revokeAiToken } from "../src/features/auth/ai-tokens";
import { cosPostPolicy } from "../src/features/meals/image-storage";

// 真实付费服务仅允许显式、私有配置和 SSH 转发的虚构预览库。
const configPath = process.argv[2];
assert.ok(configPath, "请指定权限为0600的真实COS验收配置文件");
assert.equal((await stat(configPath)).mode & 0o777, 0o600);
const env = parseEnv(await readFile(configPath, "utf8"));
const databaseURL = new URL(env.DATABASE_URL ?? "invalid:");
assert.ok(["postgres:", "postgresql:"].includes(databaseURL.protocol));
assert.equal(databaseURL.hostname, "127.0.0.1");
assert.equal(databaseURL.pathname, "/formward_preview");
assert.ok([...databaseURL.searchParams.keys()].every(k => ["max", "sslmode"].includes(k)));
assert.equal(env.FORMWARD_COS_BUCKET, "formward-images-1520483841");
assert.equal(env.FORMWARD_COS_REGION, "ap-shanghai");
assert.ok(env.FORMWARD_COS_SECRET_ID && env.FORMWARD_COS_SECRET_KEY);
assert.equal(env.FORMWARD_COS_ACCEPT_DISPOSABLE_TEST, "yes");
for (const key of ["FORMWARD_COS_BUCKET", "FORMWARD_COS_REGION", "FORMWARD_COS_SECRET_ID", "FORMWARD_COS_SECRET_KEY"]) process.env[key] = env[key];
const cn = "http://127.0.0.1:3300", globalSite = "http://localhost:3301";
const artifacts = resolve(".codex/real-cos");
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const database = createDatabase(databaseURL.toString()), db = database.db;
const cos = new COS({ SecretId: env.FORMWARD_COS_SECRET_ID, SecretKey: env.FORMWARD_COS_SECRET_KEY, Timeout: 15000 });
const bucket = { Bucket: env.FORMWARD_COS_BUCKET, Region: env.FORMWARD_COS_REGION };
const origin = `https://${bucket.Bucket}.cos.${bucket.Region}.myqcloud.com`;
const run = randomUUID(), checks: string[] = [], errors: string[] = [];
const password = "Fictional-COS-" + randomUUID();
const disposable = new Set<string>();
function fictionalPhoto(seed: string) {
  const color = createHash("sha256").update(seed).digest();
  const pixels = Buffer.alloc(180 * (1 + 320 * 3));
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) for (let c = 0; c < 3; c++) pixels[y * 961 + 1 + x * 3 + c] = (color[c + (x < 160 ? 0 : 3)] + Math.floor(y / 30) * 12) % 256;
  const chunk = (type: string, data: Buffer) => {
    const value = Buffer.concat([Buffer.from(type), data]), prefix = Buffer.alloc(4), suffix = Buffer.alloc(4); prefix.writeUInt32BE(data.length);
    let crc = 0xffffffff; for (const byte of value) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([prefix, value, suffix]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(320, 0); header.writeUInt32BE(180, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const png = fictionalPhoto(run);
const file = { fileName: "虚构COS验收.png", mimeType: "image/png", size: png.length, sha256: createHash("sha256").update(png).digest("hex") };
let browser: { close(): Promise<void> } | undefined, failed = false, phase = "guard", tokenId = "", personId = "";
const redact = (text: string) => [password, env.FORMWARD_COS_SECRET_ID!, env.FORMWARD_COS_SECRET_KEY!].reduce((s, secret) => s.replaceAll(secret, "[redacted]"), text).replace(/https?:\/\/[^\s"<>]+\?[^\s"<>]+/g, "[signed-url-redacted]");
function enter(next: string) { phase = next; console.log(next); }
async function denied(work: Promise<unknown>, label: string) {
  let status = 0;
  try { await work; } catch (error) { status = (error as { statusCode?: number }).statusCode ?? 0; }
  assert.equal(status, 403, label);
}
try {
  assert.ok((await db.select({ email: schema.user.email }).from(schema.user)).every(v => v.email.endsWith(".test")), "拒绝非虚构数据库");
  const person = await provisionAccount(db, { email: `cos-${run}@example.test`, password, name: "虚构COS验收" });
  personId = person.id;
  await writeFile(resolve(artifacts, "preview-login.json"), JSON.stringify({ email: `cos-${run}@example.test`, password }), { mode: 0o600 });
  const stranger = await provisionAccount(db, { email: `cos-other-${run}@example.test`, password, name: "虚构其他账号" });
  const tmp = `meal-tmp-v2/${person.id}/${randomUUID()}`;
  disposable.add(tmp);
  enter("real-cos-permissions");
  await cos.putObject({ ...bucket, Key: tmp, Body: png, ContentType: "image/png" });
  const head = await cos.headObject({ ...bucket, Key: tmp });
  assert.equal(head.headers?.["x-cos-server-side-encryption"], "AES256", "真实照片必须使用桶默认加密");
  const fetched = await fetch(cos.getObjectUrl({ ...bucket, Key: tmp, Sign: true, Expires: 60 }), { signal: AbortSignal.timeout(20000) });
  assert.equal(fetched.status, 200); assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), png);
  assert.equal((await fetch(`${origin}/${tmp}`, { signal: AbortSignal.timeout(15000) })).status, 403);
  await cos.getBucket({ ...bucket, Prefix: "meal-tmp-v2/", MaxKeys: 1 });
  await cos.getBucket({ ...bucket, Prefix: "meal-formal-v2/", MaxKeys: 1 });
  await denied(cos.getBucket({ ...bucket, MaxKeys: 1 }), "禁止列举整桶");
  await denied(cos.getService(), "禁止列出其他存储桶");
  const outside = `not-authorized/${run}`; disposable.add(outside);
  await denied(cos.putObject({ ...bucket, Key: outside, Body: png }), "禁止目录外写入");
  const publicKey = `meal-tmp-v2/${person.id}/${randomUUID()}`; disposable.add(publicKey);
  await denied(cos.putObject({ ...bucket, Key: publicKey, Body: png, ACL: "public-read" }), "上传权限不能公开照片");
  await denied(cos.putObjectAcl({ ...bucket, Key: tmp, ACL: "public-read" }), "禁止修改照片ACL");
  checks.push("真实COS：加密写入／字节一致读取／私有匿名拒绝／前缀列表／目录外与公开ACL拒绝");
  enter("real-cos-cors");
  const preflight = async (source: string) => fetch(origin + "/", { method: "OPTIONS", headers: { Origin: source, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" }, signal: AbortSignal.timeout(15000) });
  for (const source of [cn, "https://cn.formward.top"]) {
    const response = await preflight(source); assert.equal(response.status, 200); assert.equal(response.headers.get("access-control-allow-origin"), source);
  }
  assert.equal((await preflight("https://attacker.example.test")).headers.get("access-control-allow-origin"), null);
  checks.push("真实CORS：仅国内站和私有预览的POST来源获准");
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/tmp/formward-account-tooling/node_modules/playwright/index.mjs");
  const active = await playwright.chromium.launch({ headless: true }); browser = active;
  const context = await active.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const other = await active.newContext(), international = await active.newContext(), anonymous = await active.newContext();
  async function login(target: typeof context, site: string, email: string) {
    const response = await target.request.post(site + "/api/auth/sign-in/email", { headers: { Origin: site }, data: { email, password }, timeout: 20000 });
    assert.equal(response.status(), 200, "真实远端HTTP登录");
    const sessionResponse = await target.request.get(site + "/api/auth/get-session");
    const session = await sessionResponse.json();
    const [stored] = await db.select({ userId: schema.session.userId }).from(schema.session).where(eq(schema.session.id, session.session.id));
    assert.equal(stored?.userId, session.user.id, "应用与测试必须连接同一个虚构数据库");
  }
  await login(context, cn, `cos-${run}@example.test`);
  await login(other, cn, `cos-other-${run}@example.test`);
  await login(international, globalSite, `cos-${run}@example.test`);
  async function request(data: unknown) { return context.request.post(cn + "/api/meal-images/upload", { headers: { Origin: cn }, data, timeout: 60000 }); }
  enter("real-production-upload");
  const preparedResponse = await request({ step: "prepare", file }); assert.equal(preparedResponse.status(), 200);
  const prepared = await preparedResponse.json(); assert.equal(prepared.provider, "cos"); disposable.add(prepared.pathname);
  const signedResponse = await request({ type: "blob.generate-presigned-url", payload: { pathname: prepared.pathname, clientPayload: prepared.ticket } });
  assert.equal(signedResponse.status(), 200); const signed = await signedResponse.json(); assert.equal(new URL(signed.url).origin, origin);
  const post = async (fields: Record<string, string>, bytes = png) => {
    const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.append(key, value);
    data.append("file", new Blob([bytes], { type: "image/png" }), "fictional.png");
    return fetch(signed.url, { method: "POST", body: data, signal: AbortSignal.timeout(30000) });
  };
  assert.equal((await post({ ...signed.fields, key: `meal-tmp-v2/${stranger.id}/${randomUUID()}` })).status, 403, "签名绑定精确路径");
  const oversized = await post(signed.fields, Buffer.concat([png, Buffer.from("too-long")]));
  assert.equal(oversized.status, 400, "签名绑定文件大小"); assert.match(await oversized.text(), /<Code>EntityTooLarge<\/Code>/);
  assert.equal((await post({ ...signed.fields, "Content-Type": "image/jpeg" })).status, 403, "签名绑定照片类型");
  assert.equal((await post(cosPostPolicy(prepared.pathname, png.length, "image/png", Date.now() - 60000, Date.now() - 120000).fields)).status, 403, "过期上传拒绝");
  const uploaded = await post(signed.fields);
  const uploadCode = uploaded.ok ? "" : (await uploaded.text()).match(/<Code>([^<]+)<\/Code>/)?.[1];
  assert.equal(uploaded.status, 204, "真实COS表单直传：" + uploadCode);
  const completedResponse = await request({ step: "complete", ticket: prepared.ticket }); assert.equal(completedResponse.status(), 200);
  const image = await completedResponse.json(); assert.equal(image.storageProvider, "cos");
  const [stored] = await db.select().from(schema.mealImage).where(eq(schema.mealImage.id, image.id));
  assert.equal(stored.userId, person.id); assert.equal(stored.storageLocation, bucket.Bucket + "@" + bucket.Region);
  assert.notEqual(stored.pathname, prepared.pathname); assert.ok(stored.pathname.startsWith("meal-formal-v2/" + person.id + "/"));
  assert.equal((await request({ step: "complete", ticket: prepared.ticket })).status(), 200);
  assert.equal((await (await request({ step: "prepare", file })).json()).image.id, image.id);
  for (const [target, site] of [[context, cn], [international, globalSite]] as const) {
    const response = await target.request.get(site + "/api/meal-images/" + image.id, { timeout: 30000 });
    assert.equal(response.status(), 200); assert.match(response.headers()["cache-control"], /private, no-store/); assert.deepEqual(await response.body(), png);
  }
  assert.equal((await anonymous.request.get(cn + "/api/meal-images/" + image.id)).status(), 401);
  assert.equal((await other.request.get(cn + "/api/meal-images/" + image.id)).status(), 404);
  checks.push("production HTTP：真实COS直传／精确签名／独立正式路径／幂等去重／两区原图一致／匿名及跨账号拒绝");
  enter("revoke-and-late-completion");
  await db.transaction(async tx => { await lockOwner(tx, person.id); await revokeAccountAccess(tx, person.id); });
  assert.equal((await international.request.get(globalSite + "/api/meal-images/" + image.id)).status(), 401);
  await login(context, cn, `cos-${run}@example.test`);
  assert.equal((await request({ step: "complete", ticket: prepared.ticket })).status(), 401);
  assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.id, image.id))).length, 1);
  await cos.headObject({ ...bucket, Key: stored.pathname });
  const restored = await context.request.get(cn + "/api/meal-images/" + image.id); assert.equal(restored.status(), 200); assert.deepEqual(await restored.body(), png);
  checks.push("真实COS：成功上传→撤销两区访问→新登录重复完成被拒绝，正式对象及附件行仍在，新会话可读取");
  enter("browser-original");
  const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(redact(error.message)));
  await page.goto(cn + "/api/meal-images/" + image.id); await page.screenshot({ path: resolve(artifacts, "chromium-original.png") });
  assert.equal(await page.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), true);
  assert.equal(errors.length, 0);
  checks.push("Chromium经应用鉴权读取真实COS原图，可正常解码");
  enter("browser-file-picker");
  const token = await createAiToken(db, person.id, "虚构COS网页验收", "write"); tokenId = token.token.id;
  const response = await context.request.post(cn + "/api/v1/meal-operations", { headers: { Authorization: "Bearer " + token.rawToken }, data: { operationId: randomUUID(), actions: [{ kind: "save_meal", date: "2026-01-02", timezone: "Asia/Shanghai", mealType: "加餐", notes: "虚构COS测试照片", items: [{ kind: "food", name: "虚构测试餐食", quantity: "1", unit: "份", nutritionBasis: "consumed_total", sourceKind: "estimated", nutrition: { caloriesKcal: "100", proteinG: "10", carbsG: "10", fatG: "2" } }] }] } });
  assert.equal(response.status(), 200); const preview = await response.json(); assert.equal(new URL(preview.confirmationUrl).origin, cn);
  await page.goto(preview.confirmationUrl); await page.getByRole("button", { name: "修改", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "修改待保存内容", exact: true }); await editor.waitFor();
  const completion = page.waitForResponse((r: { url(): string; request(): { postDataJSON(): { step?: string } }; status(): number }) => new URL(r.url()).pathname === "/api/meal-images/upload" && r.request().postDataJSON()?.step === "complete", { timeout: 60000 });
  await editor.locator('input[type="file"]').setInputFiles({ name: "fictional-browser.png", mimeType: "image/png", buffer: fictionalPhoto(run + "browser") });
  assert.equal((await completion).status(), 200);
  await editor.getByRole("button", { name: "移除照片 1", exact: true }).waitFor();
  await editor.locator("img").waitFor(); assert.equal(await editor.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 320), true);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: resolve(artifacts, `chromium-upload-${width}.png`), fullPage: true }); }
  await editor.getByRole("button", { name: "应用修改", exact: true }).click(); await editor.waitFor({ state: "hidden" });
  assert.equal(errors.length, 0);
  checks.push("真实网页选图→浏览器直传COS→应用登记→预览解码→应用修改；1440／390／320截图，无客户端异常");
  const webkit = await playwright.webkit.launch({ headless: true });
  try {
    const secondContext = await webkit.newContext({ storageState: await context.storageState(), viewport: { width: 390, height: 844 } });
    const secondPage = await secondContext.newPage(); secondPage.on("pageerror", (error: Error) => errors.push(redact(error.message)));
    await secondPage.goto(cn + "/api/meal-images/" + image.id);
    assert.equal(await secondPage.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 320), true);
    await secondPage.screenshot({ path: resolve(artifacts, "webkit-original.png") }); assert.equal(errors.length, 0);
  } finally { await webkit.close(); }
  checks.push("WebKit经应用鉴权读取真实COS原图，正常解码且无客户端异常");
} catch (error) {
  failed = true; console.error(redact(error instanceof Error ? error.message : String(error)));
} finally {
  // 只删除本轮明确生成的临时测试路径；已登记的正式假照片保留作人工验收。
  for (const Key of disposable) { try { await cos.deleteObject({ ...bucket, Key }); } catch (error) { if ((error as { statusCode?: number }).statusCode !== 403) { failed = true; console.error("本轮临时照片清理失败"); } } }
  if (tokenId) await revokeAiToken(db, personId, tokenId);
  await browser?.close(); await database.close();
  const report = { status: failed ? "failed" : "passed", phase, checks, pageErrors: errors, untested: ["Vercel公网回源及真实跨境网络", "真实用户照片与正式迁移", "真实iPhone／微信与系统软键盘"] };
  await writeFile(resolve(artifacts, "http-report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, phase, checks: checks.length, report: ".codex/real-cos/http-report.json" }));
}
if (failed) process.exitCode = 1;
