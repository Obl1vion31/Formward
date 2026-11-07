import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { capturePersonal, sevenDays, type Capture, type Json } from "./client";
import { demoCapture, makeReport } from "./model";
import { renderReport } from "./report";
import { readPrivateConfig, servePrivateReport, writePrivateReport } from "./private-files";

const window = sevenDays(new Date("2026-11-07T00:30:00Z"), "Asia/Shanghai");
function capture(daily: Json, activities: Json[] = []): Capture { return { mode: "demo", fetchedAt: "2026-11-07T01:00:00Z", window, region: "global", daily: { ok: true, data: daily, rawText: JSON.stringify(daily) }, activityPages: [{ ok: true, data: activities, rawText: JSON.stringify(activities) }], activitiesComplete: true }; }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("七日窗口依据配置时区，含今天，跨月／年不依赖服务器时区", () => {
  assert.equal(sevenDays(new Date("2026-01-01T00:00:00Z"), "America/Los_Angeles").to, "2025-12-31");
  assert.deepEqual(window.dates, ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
  assert.throws(() => sevenDays(new Date(), "wrong-timezone"), /时区/);
});

test("只向选择的官方站点认证及 GET，七日查询正确，令牌不进入结果", async () => {
  const requests: { url: URL; init: RequestInit }[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input)); requests.push({ url, init: init! });
    if (init?.method === "POST") return new Response("fictional-bearer");
    return response(url.pathname.includes("dailysummaries") ? { data: [] } : []);
  }) as typeof fetch;
  const result = await capturePersonal({ apiKey: "fictional-key", region: "global", timeZone: "Asia/Shanghai", now: new Date("2026-11-07T00:30:00Z") }, fetcher);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(r => r.url.origin === "https://personal.connectapi.garmin.com" && r.init.redirect === "error" && r.init.cache === "no-store"));
  assert.equal(requests[0].init.method, "POST");
  assert.equal((requests[0].init.headers as Record<string, string>).Accept, "*/*");
  for (const r of requests.slice(1)) { assert.equal(r.init.method, "GET"); assert.equal(r.url.searchParams.get("startDate"), "2026-11-01"); assert.equal(r.url.searchParams.get("endDate"), "2026-11-07"); }
  assert.equal(requests.find(r => r.url.pathname.includes("activitylist"))!.url.searchParams.get("excludeChildren"), "true");
  assert.doesNotMatch(JSON.stringify(result), /fictional-key|fictional-bearer/);
});

test("接口局部失败保持可用结果，错误响应和敏感内容不透传", async () => {
  const fetcher = (async (input, init) => init?.method === "POST" ? new Response("secret-bearer") : String(input).includes("dailysummaries") ? response({ data: [] }) : new Response("SECRET-RESPONSE", { status: 429 })) as typeof fetch;
  const report = makeReport(await capturePersonal({ apiKey: "secret-key", region: "global", timeZone: "Asia/Shanghai" }, fetcher));
  assert.equal(report.activitiesComplete, false); assert.match(report.issues.join(), /频率受限/);
  assert.doesNotMatch(JSON.stringify(report), /secret-key|secret-bearer|SECRET-RESPONSE/);
});

test("分页读取完整并检测重复页，避免静默截断和无限循环", async () => {
  let pages = 0;
  const fetcher = (async (input, init) => {
    if (init?.method === "POST") return new Response("fictional");
    if (String(input).includes("dailysummaries")) return response({ data: [] });
    pages++; return response(Array.from({ length: 50 }, (_, i) => ({ activityId: i + 1 })));
  }) as typeof fetch;
  const result = await capturePersonal({ apiKey: "fictional", region: "global", timeZone: "Asia/Shanghai" }, fetcher);
  assert.equal(pages, 2); assert.equal(result.activitiesComplete, false);
  assert.match(makeReport(result).issues.join(), /重复/);
});

test("字段结构使用 V2，零／空／缺失分开，单次运动不加进每日消耗", () => {
  const source = capture({ data: [{ calendarDate: "2026-11-07", calories: { burnedTotal: 1800, burnedResting: 1800, burnedActive: 0 } }, { calendarDate: "2026-11-06", calories: { burnedTotal: null } }] }, [{ activityId: 12, startTimeLocal: "2026-11-07 08:10:00", duration: 90, calories: 400, bmrCalories: 20, activityType: { typeKey: "running" } }]);
  const before = JSON.stringify(source), report = makeReport(source);
  assert.equal(report.daily.at(-1)!.total, 1800); assert.equal(report.daily.at(-1)!.active, 0); assert.equal(report.daily[5].total, null); assert.equal(report.daily[0].hasData, false);
  const field = report.fields.find(f => f.path === "calories.burnedActive")!;
  assert.equal(field.zeros, 1); assert.equal(field.missing, 1);
  assert.equal(report.activities[0].seconds, 90); assert.equal(report.activities[0].calories, 400);
  assert.equal(JSON.stringify(source), before);
});

test("同日冲突、分项异常、坏结构和活动去重都明确报告", () => {
  let report = makeReport(capture({ data: [{ calendarDate: "2026-11-07", calories: { burnedTotal: 100 } }, { calendarDate: "2026-11-07", calories: { burnedTotal: 200 } }] }));
  assert.equal(report.daily.at(-1)!.total, null); assert.match(report.daily.at(-1)!.notes.join(), /多份/);
  report = makeReport(capture({ data: [{ calendarDate: "2026-11-07", calories: { burnedTotal: 200, burnedActive: -1, burnedResting: "100" } }] }));
  assert.equal(report.daily.at(-1)!.active, null); assert.match(report.daily.at(-1)!.notes.join(), /不符合/);
  report = makeReport(capture({ unexpected: [] }, [{ activityId: 1 }, { activityId: 1 }]));
  assert.match(report.issues.join(), /结构/); assert.match(report.issues.join(), /重复/); assert.equal(report.activities.length, 1);
});

test("GMT 明确按 UTC 处理，当地日期不被服务器偏移，超范围不混入", () => {
  const report = makeReport(capture({ data: [] }, [{ activityId: 1, startTimeGMT: "2026-11-06 17:10:00" }, { activityId: 2, startTimeLocal: "2026-11-01 00:10:00" }, { activityId: 3, startTimeLocal: "2026-10-31 23:59:00" }]));
  assert.equal(report.activities[0].date, "2026-11-07"); assert.match(report.activities[0].notes.join(), /配置时区/);
  assert.equal(report.activities[1].date, "2026-11-01"); assert.equal(report.activities.length, 2); assert.match(report.issues.join(), /超出/);
});

test("白名单预览排除自由名称、身份、位置和未识别字段值，脚本注入被转义", () => {
  const report = makeReport(capture({ data: [{ calendarDate: "2026-11-07", userProfilePk: 77777777, profileName: "PRIVATE-NAME", calories: { burnedTotal: 2000 }, future: { text: "PRIVATE-TEXT" } }] }, [{ activityId: 88888888, activityName: "PRIVATE-ADDRESS", startLatitude: 12.34567, activityType: { typeKey: "</script><img src=x onerror=alert(1)>" } }]));
  const html = renderReport(report), sample = JSON.stringify(report.sample);
  assert.doesNotMatch(html, /PRIVATE-NAME|PRIVATE-ADDRESS|PRIVATE-TEXT|77777777|88888888|12\.34567/);
  assert.doesNotMatch(sample, /PRIVATE|startLatitude|userProfilePk/);
  assert.match(html, /&lt;\/script&gt;/); assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /connect-src|default-src 'none'/); assert.match(html, /虚构演示/);
});

test("私有配置与输出仅当前用户可读，原始响应不修改，临时服务不暴露目录", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "formward-garmin-"));
  try {
    const config = path.join(root, "garmin.env"); await fs.writeFile(config, 'GARMIN_PERSONAL_API_KEY="fictional-key"\nGARMIN_PREVIEW_TIMEZONE="Asia/Shanghai"\n', { mode: 0o600 });
    assert.equal((await readPrivateConfig(config)).apiKey, "fictional-key");
    if (process.platform !== "win32") { await fs.chmod(config, 0o644); await assert.rejects(readPrivateConfig(config), /600/); await fs.chmod(config, 0o600); }
    const source = demoCapture(window), before = JSON.stringify(source), result = await writePrivateReport(root, source, makeReport(source));
    assert.equal(JSON.stringify(source), before); assert.deepEqual(JSON.parse(await fs.readFile(result.rawPath, "utf8")), source);
    if (process.platform !== "win32") for (const file of [result.rawPath, result.htmlPath, result.reportPath, result.samplePath]) assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    const server = await servePrivateReport(result.html);
    try { const page = await fetch(server.url); assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store, private"); assert.equal((await fetch(new URL("/", server.url))).status, 404); assert.equal((await fetch(server.url, { method: "POST" })).status, 404); }
    finally { await server.close(); }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("密钥与站点无效时不发请求，认证拒绝不会继续读取或泄露响应", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return new Response("PRIVATE-ERROR", { status: 401 }); }) as typeof fetch;
  await assert.rejects(capturePersonal({ apiKey: "", region: "global", timeZone: "Asia/Shanghai" }, fetcher), /填写/); assert.equal(calls, 0);
  await assert.rejects(capturePersonal({ apiKey: "fictional", region: "constructor" as "global", timeZone: "Asia/Shanghai" }, fetcher), /站点/); assert.equal(calls, 0);
  await assert.rejects(capturePersonal({ apiKey: "fictional", region: "global", timeZone: "Asia/Shanghai" }, fetcher), e => e instanceof Error && /密钥无效/.test(e.message) && !e.message.includes("PRIVATE")); assert.equal(calls, 1);
});

test("超大响应与非 JSON 是局部错误，不能被当成空记录", async () => {
  const fetcher = (async (input, init) => init?.method === "POST" ? new Response("fictional-token") : String(input).includes("dailysummaries") ? new Response("{}", { headers: { "content-length": "99999999" } }) : new Response("<html>not-json</html>")) as typeof fetch;
  const report = makeReport(await capturePersonal({ apiKey: "fictional", region: "global", timeZone: "Asia/Shanghai" }, fetcher));
  assert.match(report.issues.join(), /大小限制/); assert.match(report.issues.join(), /不是有效 JSON/); assert.equal(report.activitiesComplete, false);
});

test("正常多页使用偏移量并读到末页，中国站只有显式选择才使用", async () => {
  const offsets: string[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "personal.connectapi.garmin.cn");
    if (init?.method === "POST") return new Response("fictional-token");
    if (url.pathname.includes("dailysummaries")) return response({ data: [] });
    const offset = url.searchParams.get("start")!; offsets.push(offset);
    return response(offset === "0" ? Array.from({ length: 50 }, (_, i) => ({ activityId: i + 1 })) : [{ activityId: 51 }]);
  }) as typeof fetch;
  const result = await capturePersonal({ apiKey: "fictional", region: "china", timeZone: "Asia/Shanghai" }, fetcher);
  assert.deepEqual(offsets, ["0", "50"]); assert.equal(result.activitiesComplete, true); assert.equal(makeReport(result).activities.length, 51);
});

test("脱敏别名保留父子及重复 ID 关系，不生成错误关联", () => {
  const report = makeReport(capture({ data: [] }, [{ activityId: 101, isParent: true }, { activityId: 102, parentId: 101 }, { activityId: 101 }]));
  const sample = report.sample as { activities: { activityId: string; parentId?: string }[] };
  assert.equal(sample.activities[0].activityId, sample.activities[1].parentId);
  assert.notEqual(sample.activities[0].activityId, sample.activities[1].activityId);
  assert.equal(sample.activities[0].activityId, sample.activities[2].activityId);
});

test("异常时分秒与不可能日期不被当作有效运动日", () => {
  const report = makeReport(capture({ data: [] }, [{ activityId: 1, startTimeLocal: "2026-11-07 99:99:99" }, { activityId: 2, startTimeLocal: "2026-02-31 08:00:00" }]));
  assert.ok(report.activities.every(r => r.date === null && r.notes.includes("开始日期待核对")));
});
