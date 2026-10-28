import {adoptedMeasurements} from "../measurements/days";
import { activityReadings } from "../activities/model";
import ExcelJS from "exceljs";
import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { readMealSnapshot } from "../meals/records";
import { dailyTotals, mealDayLabels, sourceLabels, type MealSnapshot, type Totals } from "../meals/model";
import { listMeasurements } from "../measurements/records";
import { measurementDisplay } from "../measurements/editing";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { linkedDate } from "../measurements/calendar";
import { readEnergySnapshot } from "../activities/records";
import { energyDays, energyModes, type EnergySnapshot } from "../activities/model";
import { overviewDays } from "../dashboard/model";

export type ExportRange = { from: string | null; to: string | null };
export type ExportData = { meals: MealSnapshot; measurements: (MeasurementDisplay & { occurredAt?: string | null })[]; energy: EnergySnapshot };
type Value = string | number | null;
type Column = { header: string; width?: number; numeric?: boolean };
export function exportRange(params: URLSearchParams): ExportRange {
  if ([...params.keys()].some(key => !["from", "to"].includes(key)) || ["from", "to"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_range", "下载只接受起止日期，不能指定其他账号。");
  const from = params.get("from") || null, to = params.get("to") || null;
  if (from && !linkedDate(from) || to && !linkedDate(to) || from && to && from > to) throw new ApiError(400, "invalid_range", "请选择有效日期，开始不能晚于结束。");
  return { from, to };
}
const inRange = (date: string, range: ExportRange) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
const number = (value: string | number | null | undefined): number | null => value == null ? null : Number(value);
const yes = (value: boolean) => value ? "是" : "否";
const col = (header: string, numeric = false, width = 20): Column => ({ header, numeric, width });
const partialNutrients = (totals: Totals | null | undefined) => Object.entries(totals?.incomplete ?? {}).filter(([, incomplete]) => incomplete).map(([key]) => ({ caloriesKcal: "热量", proteinG: "蛋白质", carbsG: "碳水", fatG: "脂肪" })[key as keyof Totals["incomplete"]]).join("、") || null;
const nutrientColumns = [col("热量 · kcal", true), col("蛋白质 · g", true), col("碳水 · g", true), col("脂肪 · g", true)];
const nutrientValues = (nutrition: { caloriesKcal: string | null; proteinG: string | null; carbsG: string | null; fatG: string | null }) => [number(nutrition.caloriesKcal), number(nutrition.proteinG), number(nutrition.carbsG), number(nutrition.fatG)];
function sheet(book: ExcelJS.Workbook, name: string, columns: Column[], values: Value[][]) {
  if(values.some(row=>row.length!==columns.length))throw new Error("导出字段数量不一致："+name);
  const page = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  page.columns = columns.map((column, index) => ({ header: column.header, key: String(index), width: column.width, style: { numFmt: column.numeric ? / · (kcal|g)$/.test(column.header)||["版本","图片数量","餐数","记录数","有效天数","时长 · 分钟","UTC偏移 · 分钟"].includes(column.header)?"0":"0.00" : "@" } }));
  for (const row of values) page.addRow(row);
  page.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  page.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF365E78" } };
  page.getRow(1).height = 28;
  page.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, page.rowCount), column: columns.length } };
  return page;
}
/** 身份由入口给出，不接收任何客户指定的账号；数据库读取保持顺序。 */
export async function readAccountExport(db: Database, userId: string): Promise<ExportData> {
  if (!userId?.trim()) throw new ApiError(401, "unauthorized", "请先登录再下载。");
  return db.transaction(async tx => {
    const meals = await readMealSnapshot(tx, userId);
    const measurements = (await listMeasurements(tx, userId)).map(row => ({ ...measurementDisplay(row), occurredAt: row.occurredAt?.toISOString() ?? null }));
    const energy = await readEnergySnapshot(tx, userId);
    return { meals, measurements, energy };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function buildAccountWorkbook(data: ExportData, range: ExportRange, context: { today: string; timezone: string; exportedAt?: Date }) {
  const book = new ExcelJS.Workbook();
  book.creator = "Formward"; book.created = context.exportedAt ?? new Date();
  const meals = data.meals.meals.filter(row => !row.deletedAt && inRange(row.date, range));
  const measurements = adoptedMeasurements(data.measurements).filter(row => inRange(row.recordDate, range));
  const dates = [...new Set([...meals.map(row => row.date), ...measurements.map(row => row.recordDate), ...data.energy.days.filter(row => !row.deletedAt && inRange(row.date, range)).map(row => row.date), ...data.energy.activities.filter(row => !row.deletedAt && inRange(row.date, range)).map(row => row.date)])].sort();
  const totals = new Map(dailyTotals(meals).map(day => [day.date, day]));
  const days = overviewDays(data.meals.meals, data.measurements, dates, true, data.energy, context.today);
  sheet(book, "每日汇总", [col("记录日期"), col("饮食日状态"), col("餐数", true), ...nutrientColumns, col("热量仅含已知部分"), col("营养缺项"), col("最终消耗 · kcal", true),col("静息 · kcal", true), col("活动 · kcal", true), col("盈余 · kcal", true), col("晨重 · kg", true), col("次晨日期"), col("次晨体重 · kg", true), col("次晨变化 · kg", true), col("体重变化含估计"), col("晨重候选未决")], days.map(day => [day.date, mealDayLabels[day.mealDayStatus], day.meals.length, ...nutrientValues(day.nutrition?.values ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null }), yes(totals.get(day.date)?.totals.incomplete.caloriesKcal ?? false), partialNutrients(day.nutrition), number(day.energy.totalKcal), number(day.energy.restingKcal), number(day.energy.activeKcal), day.energyBalance, number(day.morning?.weightKg), day.nextDate, number(day.nextMorning?.weightKg), day.weightChangeKg, yes(day.differenceEstimated), yes(day.ambiguous)]));
  sheet(book, "餐次", [col("记录日期"), col("餐次"), col("饮食日状态"), ...nutrientColumns, col("热量仅含已知部分"), col("营养缺项"), col("记录来源"), col("准确发生时间 · UTC", false, 28), col("时区"), col("备注", false, 50), col("图片数量", true), col("图片内部标识", false, 45), col("餐次内部标识", false, 38), col("版本", true)], meals.map(row => [row.date, row.mealType, mealDayLabels[row.day?.status ?? "unconfirmed"], ...nutrientValues(row.totals.values), yes(row.totals.incomplete.caloriesKcal), partialNutrients(row.totals), row.source, row.occurredAt ?? null, row.timezone ?? null, row.notes ?? null, row.imageIds?.length ?? 0, row.imageIds?.join("、") ?? null, row.id, row.version]));
  sheet(book, "食物明细", [col("记录日期"), col("餐次"), col("食物名称", false, 40), col("本次用量", true), col("用量单位"),col("营养输入口径"),...["每份热量 · kcal","每份蛋白质 · g","每份碳水 · g","每份脂肪 · g"].map(label=>col(label,true)), ...nutrientColumns, col("营养依据类型"), col("用量判断"), col("依据", false, 60), col("来源链接", false, 45), col("食材基准数量", true), col("食材基准单位"),col("一包装对应基准数量",true),col("包装单位"), col("食材内部标识", false, 38), col("餐次内部标识", false, 38)], meals.flatMap(row => row.items.map(item => [row.date, row.mealType, item.name, number(item.quantity), item.unit ?? null,item.nutritionBasis==="per_portion"?"每份营养乘份数":"本次总量",...nutrientValues(item.perPortionNutrition??{caloriesKcal:null,proteinG:null,carbsG:null,fatG:null}), ...nutrientValues(item.nutrition), sourceLabels[item.sourceKind], item.amountDecision ?? null, item.basis ?? null, item.evidenceUrl ?? null, number(item.foodSnapshot?.baseQuantity), item.foodSnapshot?.unit ?? null,number(item.foodSnapshot?.servingQuantity),item.foodSnapshot?.servingUnit??null, item.foodId ?? item.foodSnapshot?.id ?? null, row.id])));
  sheet(book, "身体记录", [col("记录日期"), col("时段"), col("体重 · kg", true), col("体脂率 · %", true), col("实测或估计"), col("空腹条件"), col("来源"), col("来源系统"), col("来源记录编号", false, 30), col("原始当地时间", false, 28), col("准确发生时间 · UTC", false, 28), col("时区"), col("UTC偏移 · 分钟", true), col("时间精度"), col("录入渠道"), col("估计依据", false, 70), col("记录内部标识", false, 38)], measurements.map(row => [row.recordDate, row.period === "daytime" ? "晨间" : "晚间", number(row.weightKg), number(row.bodyFatPercent), row.recordKind === "estimated" ? "估计" : "实测", row.fasting == null ? "未知" : row.fasting ? "空腹" : "非空腹", row.recordKind === "estimated" ? "系统估计" : row.deviceLabel ?? null, row.sourceSystem, row.sourceRecordId, row.sourceLocalTime, row.occurredAt ?? null, row.timezone, row.utcOffsetMinutes ?? null, row.timePrecision, row.entryChannel, row.estimation ? JSON.stringify(row.estimation) : null, row.id]));
  const expenditures = energyDays(data.energy, data.measurements, dates).filter(day => day.record || day.activities.length);
  sheet(book, "每日消耗", [col("记录日期"), col("录入方式"), col("活动采用方式"), col("最终消耗 · kcal", true),col("录入总数 · kcal",true),col("录入活动合计 · kcal",true),col("额外运动 · kcal",true), col("静息 · kcal", true), col("活动 · kcal", true), col("总数来源"), col("静息来源"), col("活动来源"), col("含内部估算标记"), col("时区"), col("来源发生时间 · UTC", false, 28), col("来源记录编号", false, 30), col("备注", false, 50), col("日记录内部标识", false, 38), col("版本", true)], expenditures.map(day => { const modes = energyModes(day.record), record = day.record, onlyTotal = modes.entryMode === "total"; return [day.date, onlyTotal ? "只记总数" : "分开记录", onlyTotal ? null : modes.activityMode === "total" ? "记合计" : "按运动累计", number(day.totalKcal),onlyTotal?number(record?.totalKcal):null,!onlyTotal&&modes.activityMode==="total"?number(record?.activeKcal):null,number(day.additionalKcal),number(day.restingKcal), number(day.activeKcal), onlyTotal ? record?.sourceSystem ?? null : null, onlyTotal ? null : record?.restingSourceSystem ?? record?.sourceSystem ?? null, onlyTotal ? null : modes.activityMode === "activities" ? [...new Set(day.activities.map(row => row.sourceSystem).filter(Boolean))].join("、") || null : record?.activeSourceSystem ?? record?.sourceSystem ?? null, yes(day.estimated), record?.timezone ?? null, record?.sourceOccurredAt ?? null, record?.sourceRecordId ?? null, record?.notes ?? null, record?.id ?? null, record?.version ?? null]; }));
  sheet(book, "活动明细", [col("记录日期"), col("活动名称", false, 35), col("热量 · kcal", true),col("计入方式"), col("时长 · 分钟", true), col("已完成"), col("来源"), col("来源记录编号", false, 30), col("来源发生时间 · UTC", false, 28), col("时区"), col("活动内部标识", false, 38), col("版本", true),col("运动填写方式"),col("期间静息 · kcal",true),col("纯运动 · kcal",true),col("本次总数 · kcal",true),col("计入当天 · kcal",true)], data.energy.activities.filter(row => !row.deletedAt && inRange(row.date, range)).map(row => [row.date, row.name, number(row.caloriesKcal),row.inclusion==="additional"?"额外增加":row.inclusion==="included"?"已包含":"原记录（沿用）",number(row.durationMinutes), yes(row.completed), row.sourceSystem, row.sourceRecordId, row.sourceOccurredAt, row.timezone, row.id, row.version,row.calorieMode==="components"?"分开填写":"只记总数",number(row.exerciseRestingKcal),number(row.exerciseActiveKcal),number(activityReadings(row).totalKcal),number(activityReadings(row).countedKcal)]));
  sheet(book, "食材库", [col("名称", false, 40), col("分类"), col("品牌"), col("规格与做法", false, 45), col("基准数量", true), col("基准单位"),col("一包装对应基准数量",true),col("包装单位"), ...nutrientColumns, col("依据类型"), col("依据", false, 60), col("来源链接", false, 45), col("图片数量", true), col("图片内部标识", false, 45), col("食材内部标识", false, 38), col("版本", true)], data.meals.foods.filter(row => !row.deletedAt).map(row => [row.name, row.category === "meal" ? "整餐" : "食材", row.brand ?? null, row.preparation ?? null, number(row.baseQuantity), row.unit,number(row.servingQuantity),row.servingUnit??null,...nutrientValues(row.nutrition), sourceLabels[row.sourceKind], row.basis ?? null, row.evidenceUrl ?? null, row.imageIds?.length ?? 0, row.imageIds?.join("、") ?? null, row.id, row.version]));
  sheet(book, "说明", [col("项目", false, 24), col("内容", false, 100)], [
    ["导出时间 · UTC", book.created.toISOString()], ["汇总时区", context.timezone], ["起始日期", range.from ?? "不限"], ["结束日期", range.to ?? "不限"],
    ["记录范围", "只含当前账号有效记录，不含已删除记录、账号凭据、访问令牌、授权或其他账号数据。"],
    ["日期筛选", "起止日均包含；只筛选每日汇总、餐次、食物明细、身体、每日消耗和活动。食材库为完整有效参考资料，不按日期筛掉。"],
    ["未知与零", "空白表示未知或不适用，数字0表示明确为零；营养缺项与全天是否已记完是两个维度。"],
    ["盈余", "沿用服务器总览：饮食日已记完且摄入和最终消耗有数值才相减；未记全仍保留摄入，估算及已记完的部分营养沿用原计算规则。"],
    ["次晨变化", "D日对应D+1晨重减D晨重，允许使用区间末日已存在的次晨；候选未决或缺记录留空，不预测。"],
    ["消耗模式", "每日消耗仅列采用的分项或总数；活动明细仍保留原始有效条目，不表示已与每日活动合计再次叠加。"],
    ["图片", "仅列图片数量与内部标识，不嵌入原图；这份Excel不是照片或完整数据库备份。"],
    ["单位与文字", "热量kcal，营养g，体重kg，体脂%，体脂差为百分点；业务日期为文本保留原日历日期。所有用户文字按字符串写入，不执行Excel公式。"],
  ]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
