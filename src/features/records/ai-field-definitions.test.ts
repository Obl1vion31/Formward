import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createMcpHandler } from "@modelcontextprotocol/server";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { createAiToken, authenticateAi } from "../auth/ai-tokens";
import { createFormwardMcp } from "../mcp/server";
import { aiContractSnapshot } from "../mcp/contract-export";
import { aiApiResponse, queryAiMeasurements, queryAiMeasurementPage } from "../measurements/ai-api";
import { submitAiMeasurementOperation, reviewAiMeasurementOperation, getAiMeasurementOperation } from "../measurements/ai-operations";
import { aiToolNames, aiFieldHint, definitionsFor, withAiFieldDefinitions, aiToolForHttp, withAiFieldDefinitionsOpenApi } from "./ai-field-definitions";
import { selectFieldDefinitions } from "./ai-field-selection.mjs";

const pg = new PGlite(), db = drizzle(pg, { schema });
const database = db as unknown as Database;
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner() {
  const userId = randomUUID();
  await db.insert(schema.user).values({ id: userId, name: "虚构字段解释用户", email: userId + "@example.test" });
  const token = await createAiToken(database, userId, "虚构字段解释测试", "write");
  return { userId, token, identity: await authenticateAi(database, "Bearer " + token.rawToken) };
}
const scopes = ["profile", "measurements:read", "measurements:write", "meals:read", "meals:write", "energy:read", "energy:write", "training:read", "training:write"];
test("HTTP协议只增加成功结果字段解释，不改变输入及错误结构", () => {
  const original = { paths: { "/example": { post: { requestBody: { required: true }, responses: { "200": { description: "成功", content: { "application/json": { schema: { type: "object", properties: { saved: { type: "number" } } } } } }, "400": { description: "无效" } } } } } };
  const result = withAiFieldDefinitionsOpenApi(original);
  assert.deepEqual(result.paths["/example"].post.requestBody, original.paths["/example"].post.requestBody);
  assert.deepEqual(result.paths["/example"].post.responses["400"], original.paths["/example"].post.responses["400"]);
  assert.equal("allOf" in original.paths["/example"].post.responses["200"].content["application/json"].schema, false);
  assert.match(JSON.stringify(result.paths["/example"].post.responses["200"]), /fieldDefinitions/);
});
async function rpc(handler: ReturnType<typeof createMcpHandler>, name: string, args: Record<string, unknown>) {
  const response = await handler.fetch(new Request("http://localhost/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
  const text = await response.text();
  const body = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : JSON.parse(text.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)!.slice(6));
  return body.result;
}

test("21项正式工具发现、共用工作规则与字段字典同源，导出不执行工具", async () => {
  const { contract, runtime } = await aiContractSnapshot();
  assert.equal(contract.tools.length, 21);
  assert.deepEqual(contract.tools.map((tool: { name: string }) => tool.name).sort(), [...aiToolNames].sort());
  assert.match(contract.instructions, /比较两个时期须取得两个时期/);
  assert.match(runtime, /selectFieldDefinitions/);
  for (const tool of contract.tools) {
    assert.match(tool.description, /fieldDefinitions/);
    assert.ok(tool.outputSchema.properties.fieldDefinitions);
    assert.ok(Object.keys(contract.fieldDefinitions[tool.name as typeof aiToolNames[number]]).length);
  }
});

test("解释只跟随已有字段，null和0保留，不把另一个领域同名字段误解释", () => {
  const original = { sevenDay: { weightKg: { change: 0, previousChange: null, coverage: 1 } }, days: [] };
  const before = structuredClone(original);
  const result = withAiFieldDefinitions("query_measurements", original);
  assert.deepEqual(original, before);
  assert.equal(result.sevenDay.weightKg.change, 0);
  assert.match(result.fieldDefinitions["sevenDay.weightKg.previousChange"], /前一个日历日/);
  assert.equal("sevenDay.bodyFatPercent.change" in result.fieldDefinitions, false);
  assert.equal("status" in result.fieldDefinitions, false);
  assert.deepEqual(selectFieldDefinitions({ x: null }, { "x.y": "不应出现", x: "未知" }), { x: "未知" });
  const mixed = withAiFieldDefinitions("get_record_operation", { rows: [{ training: { after: { weightKg: "50" } } }] });
  assert.equal(Object.values(mixed.fieldDefinitions).some(text => text.includes("实测体重")), false);
});

test("所有工具都有按业务状态解释的实际返回样例，查询与预览不串口径", () => {
  const samples: Record<string, Record<string, unknown>> = {
    authorize_formward: { connected: true, access: "read_and_submit_previews", domains: [], requiresWebConfirmation: true },
    get_profile: { id: "fictional", displayName: "虚构" },
    query_measurements: { days: [], sevenDay: { weightKg: { change: -1, coverage: 6 } } },
    search_foods: { foods: [] }, import_meal_images: { status: "partial", images: [], failures: [] },
    search_exercises: { exercises: [], total: 150, units: {} },
    query_training: { templates: [], plans: [], sessions: [], requiresWebConfirmation: true },
    query_energy: { days: [{ totalKcal: "2000", cumulative: true, additionalKcal: "100" }] },
    query_meals: { meals: [], days: [{ day: { status: "unconfirmed" }, totals: { values: { caloriesKcal: "500" }, incomplete: { caloriesKcal: true } } }] },
  };
  for (const name of aiToolNames) {
    const data = samples[name] ?? { id: "fictional", status: "pending", revision: 1, canConfirm: true, rows: [], saved: 0 };
    const result = withAiFieldDefinitions(name, data);
    assert.ok(Object.keys(result.fieldDefinitions).length, name);
    const { fieldDefinitions: _definitions, ...plain } = result;
    assert.ok(Object.keys(_definitions).length);
    assert.deepEqual(plain, data, name);
  }
  const image = withAiFieldDefinitions("import_meal_images", samples.import_meal_images);
  assert.match(image.fieldDefinitions.status, /只表示附件/);
  assert.match(withAiFieldDefinitions("append_pending_images", { status: "pending", revision: 2 }).fieldDefinitions.status, /审核业务状态/);
  assert.match(withAiFieldDefinitions("get_record_operation", { status: "completed" }).fieldDefinitions.status, /不能单凭它/);
  assert.match(withAiFieldDefinitions("query_meals", samples.query_meals).fieldDefinitions["days.*.day.status"], /不表示已有餐次未保存/);
  assert.match(withAiFieldDefinitions("query_training", samples.query_training).fieldDefinitions.requiresWebConfirmation, /不表示本次查询/);
  assert.match(withAiFieldDefinitions("query_energy", samples.query_energy).fieldDefinitions["days.*.additionalKcal"], /不再另加一次/);
});

test("字段文字明确数量基准、版本、省略与清空、训练实际和估算来源", () => {
  const food = withAiFieldDefinitions("search_foods", { foods: [{ baseQuantity: "100", nutrition: { caloriesKcal: "60" }, version: 2 }] });
  assert.match(food.fieldDefinitions["foods.*.nutrition"], /不是本次实际摄入/);
  const meal = withAiFieldDefinitions("preview_meal_changes", { rows: [{ before: {}, after: { sourceKind: "estimated", nutritionBasis: "per_reference", clearFields: ["proteinG"] } }] });
  assert.match(meal.fieldDefinitions["**.nutritionBasis"], /每参考量/);
  assert.match(meal.fieldDefinitions["**.clearFields"], /省略字段保持原值/);
  const plan = withAiFieldDefinitions("query_training", { sessions: [{ elapsedSeconds: 120 }], plans: [{}], templates: [] });
  assert.match(plan.fieldDefinitions["sessions.*.elapsedSeconds"], /不是分钟/);
  assert.match(plan.fieldDefinitions.plans, /已安排不等于已完成/);
  assert.match(aiFieldHint("query_measurements"), /不是与前一周/);
  assert.ok(definitionsFor("preview_meal_changes")["**.quantityEffect"]);
});

test("真实身体查询的七日窗口与有效样本日期分开，旧摘要保留自身scope", async () => {
  const { userId, identity } = await owner();
  for (const [date, period, weight, fat] of [
    ["2024-08-01", "daytime", "70", "20"], ["2024-08-02", "daytime", "69", null],
    ["2024-08-03", "evening", "99", "40"], ["2025-08-01", "daytime", "80", null],
  ] as const) {
    const preview = await submitAiMeasurementOperation(database, identity, { kind: "batch", operationId: randomUUID(), items: [{ kind: "save_record", date, period, weightKg: weight, bodyFatPercent: fat, fasting: period === "daytime", deviceLabel: "虚构秤" }] }, "Asia/Shanghai");
    await reviewAiMeasurementOperation(database, userId, preview.id, { kind: "confirm", revision: preview.revision });
  }
  const result = await queryAiMeasurementPage(database, userId, new URLSearchParams({ from: "2024-08-03", to: "2024-08-04", view: "summary" }), "Asia/Shanghai");
  assert.deepEqual(result.sevenDay.window, { from: "2024-07-29", to: "2024-08-04" });
  assert.equal(result.sevenDay.weightKg.value, null);
  assert.equal(result.sevenDay.weightKg.previousChange, null);
  assert.equal(result.sevenDay.weightKg.change, -1);
  assert.equal(result.sevenDay.weightKg.average, 69.5);
  assert.equal(result.sevenDay.weightKg.coverage, 2);
  assert.equal(result.sevenDay.weightKg.start, "2024-08-01");
  assert.equal(result.sevenDay.weightKg.end, "2024-08-02");
  assert.equal(result.sevenDay.bodyFatPercent.change, null);
  const legacy = await queryAiMeasurements(database, userId, new URLSearchParams({ from: "2024-08-01", to: "2024-08-04" }), "Asia/Shanghai");
  assert.equal(legacy.analyses.weightKg.summary.current?.weightKg, "80.00");
  assert.equal(legacy.analyses.weightKg.summary.scope, "latest_available_seven_days");
  const paged = await queryAiMeasurementPage(database, userId, new URLSearchParams({ from: "2024-01-01", to: "2025-12-31", view: "summary" }), "Asia/Shanghai");
  assert.equal(paged.page.hasMore, true);
  assert.equal(paged.sevenDay.window.to, paged.page.to);
  assert.notEqual(paged.sevenDay.window.to, paged.range.to);
});

test("真实MCP文本与结构结果一致，跨域只读及预览得到解释且不保存事实", async () => {
  const { userId, identity } = await owner();
  const handler = createMcpHandler(() => createFormwardMcp(database, identity, scopes, new Request("http://localhost/api/mcp")), { legacy: "stateless" });
  try {
    for (const [name, args] of [
      ["authorize_formward", {}], ["get_profile", {}],
      ["query_measurements", { range: "last7", view: "summary" }],
      ["query_meals", { range: "last7", view: "summary" }],
      ["query_energy", { range: "last7", view: "summary" }],
      ["query_training", { range: "last7", view: "summary" }],
      ["search_foods", {}], ["search_exercises", {}],
      ["preview_meal", { operationId: randomUUID(), date: "2024-08-01", mealType: "午餐", foods: [{ name: "虚构测试餐", quantity: "1", unit: "份", caloriesKcal: "500", sourceKind: "estimated", basis: "虚构本次总量" }] }],
      ["preview_energy", { operationId: randomUUID(), date: "2024-08-01", totalKcal: "2000" }],
    ] as const) {
      const result = await rpc(handler, name, args);
      assert.notEqual(result?.isError, true, JSON.stringify(result));
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
      assert.ok(Object.keys(result.structuredContent.fieldDefinitions).length, name);
    }
    assert.equal((await db.select().from(schema.meal).where((await import("drizzle-orm")).eq(schema.meal.userId, userId))).length, 0);
  } finally { await handler.close(); }
});

test("HTTP使用同源解释；无效凭据、未知路由和其他账号原保护保持", async () => {
  const { userId, token } = await owner();
  const request = new Request("http://localhost/api/v1/measurements?from=2024-08-01&to=2024-08-02", { headers: { authorization: "Bearer " + token.rawToken } });
  const response = await aiApiResponse(request, database, false, identity => {
    assert.equal(identity.userId, userId);
    return queryAiMeasurements(database, identity.userId, new URL(request.url).searchParams, "Asia/Shanghai");
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.fieldDefinitions["analyses.*.summary.scope"]);
  let called = false;
  const invalid = await aiApiResponse(new Request(request.url), database, false, async () => { called = true; return {}; });
  assert.equal(invalid.status, 401); assert.equal(called, false);
  assert.equal("fieldDefinitions" in await invalid.json(), false);
  const other = await owner();
  const preview = await submitAiMeasurementOperation(database, (await authenticateAi(database, "Bearer " + token.rawToken)), { kind: "batch", operationId: randomUUID(), items: [{ kind: "save_record", date: "2024-08-01", period: "daytime", weightKg: "70", fasting: true, deviceLabel: "虚构秤" }] }, "Asia/Shanghai");
  const crossed = await aiApiResponse(new Request("http://localhost/api/v1/measurement-operations/" + preview.id, { headers: { authorization: "Bearer " + other.token.rawToken } }), database, false, identity => getAiMeasurementOperation(database, identity.userId, preview.id));
  assert.equal(crossed.status, 404);
  assert.equal("fieldDefinitions" in await crossed.json(), false);
  assert.equal(aiToolForHttp(new Request("http://localhost/api/record-changes", { method: "POST" })), null);
  assert.equal(aiToolForHttp(new Request("http://localhost/api/v1/meal-images", { method: "POST" })), "import_meal_images");
});

test("MCP权限失败仍是错误，不附健康数据或把拒绝说成成功", async () => {
  const { identity } = await owner();
  const handler = createMcpHandler(() => createFormwardMcp(database, identity, [], new Request("http://localhost/api/mcp")), { legacy: "stateless" });
  try {
    const result = await rpc(handler, "query_measurements", { range: "last7", view: "summary" });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, "insufficient_scope");
    assert.equal("days" in result.structuredContent, false);
    assert.equal("fieldDefinitions" in result.structuredContent, false);
  } finally { await handler.close(); }
});
