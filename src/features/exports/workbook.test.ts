import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import { buildAccountWorkbook, exportRange, readAccountExport, type ExportData } from "./workbook";
import { emptyNutrition, sumNutrition, type MealView } from "../meals/model";
import type { MeasurementDisplay } from "../measurements/entry-state";
import type { EnergyDayRecord } from "../activities/model";
const date = "2024-08-01", next = "2024-08-02", malicious = "=HYPERLINK(\"https://example.invalid\",\"虚构名称\")";
const nutrition = { caloriesKcal: "1250.2500", proteinG: "50", carbsG: null, fatG: "0" };
function meal(day: string, status: "complete" | "incomplete" | "unconfirmed", patch: Partial<MealView> = {}): MealView {
  const items = [{ kind: "food" as const, name: malicious, quantity: "2", unit: "份", nutrition, sourceKind: "estimated" as const }, { kind: "food" as const, name: "未知项目", nutrition: emptyNutrition(), sourceKind: "unknown" as const }];
  return { id: randomUUID(), version: 1, date: day, mealType: "午餐", timezone: "Asia/Shanghai", source: "manual", deletedAt: null, imageIds: [randomUUID()], items, totals: sumNutrition(items.map(row => row.nutrition)), day: { date: day, status, version: 1, contentDigest: "a".repeat(64), source: "user" }, ...patch };
}
function weight(day: string, value: string, estimated = false): MeasurementDisplay { return { id: randomUUID(), recordDate: day, period: "daytime", weightKg: value, bodyFatPercent: null, fasting: true, sourceLocalTime: day, timezone: "Asia/Shanghai", sourceType: "manual", sourceSystem: "虚构应用", sourceRecordId: null, recordKind: estimated ? "estimated" : "observed", deviceLabel: estimated ? null : "虚构秤", estimation: null, entryChannel: estimated ? null : "manual", timePrecision: "day_period", updatedAt: day }; }
const source = { timezone: "Asia/Shanghai", sourceSystem: "虚构手表", sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal" as const, syncStatus: "confirmed" as const };
function energy(day: string, patch: Partial<EnergyDayRecord> = {}): EnergyDayRecord { return { id: randomUUID(), date: day, version: 1, deletedAt: null, ...source, entryMode: "components", activityMode: "total", restingKcal: "2000", activeKcal: "0", totalKcal: null, ...patch }; }
const context = { today: next, timezone: "Asia/Shanghai", exportedAt: new Date("2024-08-03T00:00:00Z") };
function data(): ExportData { return { meals: { meals: [meal(date, "complete"), meal(next, "incomplete"), meal("2024-07-31", "complete", { deletedAt: "2024-08-01" })], foods: [{ id: randomUUID(), version: 1, deletedAt: null, name: malicious, baseQuantity: "100", unit: "g", nutrition, sourceKind: "estimated" }] }, measurements: [weight(date, "70.00"), weight(next, "70.50", true)], energy: { days: [energy(date), energy(next, { entryMode: "total", totalKcal: "2800", restingKcal: "1111", activeKcal: "999" })], activities: [{ id: randomUUID(), date, version: 1, deletedAt: null, name: malicious, caloriesKcal: null, durationMinutes: "0", completed: false, ...source }], profiles: [{ id: randomUUID(), effectiveFrom: "2024-01-01", heightCm: "175", birthDate: "1994-01-01", sex: "male", version: 1, deletedAt: null }] } }; }
async function read(bytes: Uint8Array) { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes.buffer as ArrayBuffer); return book; }
function value(book: ExcelJS.Workbook, sheet: string, row: number, header: string) { const page = book.getWorksheet(sheet)!; const columns = page.getRow(1).values as string[]; const column = columns.indexOf(header); assert.ok(column > 0, header); return page.getCell(row, column).value; }

test("导出范围只接受合法单次起止日期，拒绝客户端账号与无效区间", () => {
  assert.deepEqual(exportRange(new URLSearchParams()), { from: null, to: null });
  assert.deepEqual(exportRange(new URLSearchParams("from=2024-02-29&to=2024-03-01")), { from: "2024-02-29", to: "2024-03-01" });
  for (const query of ["user_id=other", "from=2024-02-30", "from=2024-08-03&to=2024-08-02", "from=2024-08-01&from=2024-08-02", "format=csv"]) assert.throws(() => exportRange(new URLSearchParams(query)));
});
test("原生xlsx回读保留数字、零、未知、来源、日完整状态与部分营养规则", async () => {
  const raw = await buildAccountWorkbook(data(), { from: null, to: null }, context);
  assert.equal(Buffer.from(raw).subarray(0,2).toString(), "PK");
  const book = await read(raw);
  assert.deepEqual(book.worksheets.map(sheet => sheet.name), ["每日汇总", "餐次", "食物明细", "身体记录", "每日消耗", "活动明细", "食材库", "说明"]);
  assert.equal(value(book, "每日汇总", 2, "记录日期"), date);
  assert.equal(value(book, "每日汇总", 2, "热量 · kcal"), 1250.25);
  assert.equal(value(book, "每日汇总", 2, "脂肪 · g"), 0);
  assert.equal(value(book, "每日汇总", 2, "碳水 · g"), null);
  assert.equal(value(book, "每日汇总", 2, "热量仅含已知部分"), "是");
  assert.match(String(value(book, "每日汇总", 2, "营养缺项")), /热量、蛋白质、碳水、脂肪/);
  assert.equal(value(book, "每日汇总", 2, "盈余 · kcal"), -749.75, "已记完的部分营养沿用服务端差额");
  assert.equal(value(book, "每日汇总", 3, "盈余 · kcal"), null, "未记全不计盈余但保留摄入");
  assert.equal(value(book, "每日汇总", 3, "热量 · kcal"), 1250.25);
  assert.equal(value(book, "每日消耗", 2, "活动 · kcal"), 0);
  assert.equal(value(book, "每日消耗", 3, "最终消耗 · kcal"), 2800);
  assert.equal(value(book, "每日消耗", 3, "静息 · kcal"), null, "总数模式不暴露未采用旧分项");
  assert.equal(value(book, "身体记录", 3, "实测或估计"), "估计");
  assert.equal(value(book, "身体记录", 2, "来源"), "虚构秤");
  assert.equal(value(book, "活动明细", 2, "热量 · kcal"), null);
  assert.equal(value(book, "活动明细", 2, "时长 · 分钟"), 0);
  assert.equal(book.getWorksheet("餐次")!.rowCount, 3, "不导出已删除餐次");
  for (const page of book.worksheets) { assert.equal(page.views[0].state, "frozen"); assert.ok(page.autoFilter); }
});
test("范围含首末日且保留末日次晨配对，参考食材与已生效资料不被截断", async () => {
  const book = await read(await buildAccountWorkbook(data(), { from: date, to: date }, context));
  assert.equal(book.getWorksheet("每日汇总")!.rowCount, 2);
  assert.equal(book.getWorksheet("身体记录")!.rowCount, 2);
  assert.equal(value(book, "每日汇总", 2, "次晨日期"), next);
  assert.equal(value(book, "每日汇总", 2, "次晨变化 · kg"), 0.5);
  assert.equal(value(book, "每日汇总", 2, "体重变化含估计"), "是");
  assert.equal(book.getWorksheet("食材库")!.rowCount, 2);
  assert.equal(book.getWorksheet("公式资料"), undefined);
});
test("用户公式样式文字按字符串保存，不生成公式或超链接执行对象", async () => {
  const book = await read(await buildAccountWorkbook(data(), { from: null, to: null }, context));
  for (const [name, header] of [["食物明细", "食物名称"], ["活动明细", "活动名称"], ["食材库", "名称"]]) {
    assert.equal(value(book, name, 2, header), malicious);
    const page = book.getWorksheet(name)!; const column = (page.getRow(1).values as string[]).indexOf(header);
    assert.equal(page.getCell(2,column).type, ExcelJS.ValueType.String); assert.equal(page.getCell(2,column).formula, undefined);
  }
});
test("账号导出读取拒绝未登录且隔离他人健康数据和凭据表", async () => {
  const pg = new PGlite(); const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await assert.rejects(readAccountExport(db, ""), /先登录/);
    const owners = [randomUUID(), randomUUID()];
    for (const [index,userId] of owners.entries()) {
      await db.insert(schema.user).values({ id: userId, email: `export-${index}@example.test`, name: "虚构导出账号" });
      const id = randomUUID();
      await db.insert(schema.meal).values({ id, userId, localDate: date, mealType: index ? "其他账号的晚餐" : "本账号的午餐", source: "manual" });
      await db.insert(schema.mealItem).values({ id: randomUUID(), userId, mealId: id, position: 0, kind: "food", name: index ? "不得出现的食物" : "自己的食物", sourceKind: "estimated", caloriesKcal: index ? "999" : "0" });
      await db.insert(schema.food).values({ id: randomUUID(), userId, name: index ? "他人食材" : "自己的食材", identityKey: randomUUID(), baseQuantity: "1", unit: "份", sourceKind: "estimated" });
      await db.insert(schema.energyDay).values({ id: randomUUID(), userId, date, timezone: "Asia/Shanghai", entryMode: "total", totalKcal: index ? "9999" : "0", sourceUnit: "kcal", syncStatus: "confirmed" });
    }
    const snapshot = await readAccountExport(db, owners[0]);
    assert.equal(snapshot.meals.meals.length, 1); assert.equal(snapshot.meals.foods.length, 1); assert.equal(snapshot.energy.days.length, 1);
    assert.equal(snapshot.meals.meals[0].mealType, "本账号的午餐");
    assert.doesNotMatch(JSON.stringify(snapshot), /不得出现|其他账号|他人食材|tokenHash|password|oauth/);
    const book = await read(await buildAccountWorkbook(snapshot, { from: null, to: null }, context));
    assert.equal(value(book, "餐次", 2, "热量 · kcal"), 0);
    assert.equal(value(book, "每日消耗", 2, "最终消耗 · kcal"), 0);
    assert.equal(book.getWorksheet("身体记录")!.rowCount, 1, "空模块保留表头，不伪造记录");
  } finally { await pg.close(); }
});

test("运动分项导出区分本次总数和当天计入值，旧运动原值保留",async()=>{const sample=data(),base=sample.energy.activities[0];sample.energy.days=[energy(date,{activityMode:"activities"})];sample.energy.activities=[{...base,completed:true,calorieMode:"components",exerciseRestingKcal:"50",exerciseActiveKcal:"400",caloriesKcal:"450"},{...base,id:randomUUID(),name:"旧运动",completed:true,caloriesKcal:"450"}];const book=await read(await buildAccountWorkbook(sample,{from:date,to:date},context));assert.equal(value(book,"每日消耗",2,"最终消耗 · kcal"),2850);assert.equal(value(book,"活动明细",2,"运动填写方式"),"分开填写");assert.equal(value(book,"活动明细",2,"期间静息 · kcal"),50);assert.equal(value(book,"活动明细",2,"纯运动 · kcal"),400);assert.equal(value(book,"活动明细",2,"本次总数 · kcal"),450);assert.equal(value(book,"活动明细",2,"计入当天 · kcal"),400);assert.equal(value(book,"活动明细",3,"运动填写方式"),"只记总数");assert.equal(value(book,"活动明细",3,"计入当天 · kcal"),450);});

test("Excel营养能量整数显示、身体两位且底层旧精度不变",async()=>{
 const book=await read(await buildAccountWorkbook(data(),{from:null,to:null},context));
 const format=(sheetName:string,header:string)=>{const page=book.getWorksheet(sheetName)!;return page.getCell(2,(page.getRow(1).values as string[]).indexOf(header)).numFmt;};
 assert.equal(format("每日汇总","热量 · kcal"),"0");assert.equal(format("每日汇总","盈余 · kcal"),"0");
 assert.equal(format("每日汇总","晨重 · kg"),"0.00");assert.equal(format("身体记录","体脂率 · %"),"0.00");
 assert.equal(value(book,"每日汇总",2,"热量 · kcal"),1250.25);
});
