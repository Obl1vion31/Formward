"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { lockPageScroll } from "@/components/scroll-lock";
import { usePageLoading } from "@/components/page-loading-state";
import { useMobileMode } from "@/components/use-mobile-mode";
import { dailyTotals, decimal, emptyNutrition, formatNutrition, metricLabels, metrics, nutritionFor, sourceLabels, type FoodDraft, type FoodView, type ItemDraft, type MealAction, type MealDraft, type MealInput, type MealOperationView, type MealSnapshot, type Metric, type Nutrition, type Result, type Totals } from "./model";
import styles from "./meals.module.css";

export type SaveMeals = (input: MealInput) => Promise<Result<{ snapshot: MealSnapshot; message: string }>>;
const unitFor = (metric: Metric) => metric === "caloriesKcal" ? "kcal" : "g";
const dateNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const dateAt = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const newItem = (kind: ItemDraft["kind"]): ItemDraft => ({ kind, name: kind === "misc" ? "杂" : kind === "whole" ? "整餐估算" : "", quantity: "1", unit: "份", sourceKind: "estimated", nutrition: emptyNutrition() });
function MetricValues({ totals, compact = false }: { totals: Totals; compact?: boolean }) {
  return <div className={compact ? styles.compactMetrics : styles.summary}>{metrics.map(metric => <div key={metric}><span>{metricLabels[metric]}</span><strong>{formatNutrition(totals.values[metric], metric)}<small>{unitFor(metric)}</small></strong>{!compact && <p>{totals.incomplete[metric] ? "已知合计 · 数据不完整" : "已记录摄入"}</p>}{compact && totals.incomplete[metric] && <small>部分</small>}</div>)}</div>;
}
export function MealsView({ snapshot, today, operations, save }: { snapshot: MealSnapshot; today: string; operations: MealOperationView[]; save: SaveMeals }) {
  const [local, setLocal] = useState<MealSnapshot | null>(null), [base, setBase] = useState(snapshot);
  if (snapshot !== base) { setBase(snapshot); setLocal(null); }
  const state = local ?? snapshot, mobile = useMobileMode(), [tab, setTab] = useState<"meals" | "foods">("meals");
  const [selectedDate, setSelectedDate] = useState(today), [expandedDate, setExpandedDate] = useState<string | null>(today), [metric, setMetric] = useState<Metric>("caloriesKcal"), [rangeChoice, setRange] = useState<string | null>(null);
  const range = rangeChoice ?? (mobile ? "7" : "30"), [customFrom, setCustomFrom] = useState(""), [customTo, setCustomTo] = useState(today);
  const [editing, setEditing] = useState<MealAction | null>(null), [showDeleted, setShowDeleted] = useState(false), [foodQuery, setFoodQuery] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [pending, startTransition] = useTransition(), [busy, setBusy] = useState(false);
  const busyRef = useRef(false), request = useRef<{ data: string; id: string } | null>(null);
  usePageLoading({ active: pending || busy, label: "正在保存饮食记录…" });
  const groups = dailyTotals(state.meals), chosen = groups.find(d => d.date === selectedDate), end = groups[0]?.date > today ? groups[0].date : today;
  const first = groups.at(-1)?.date ?? today, from = range === "all" ? first : range === "custom" ? customFrom : dateAt(dateNumber(end) - Number(range) + 1), to = range === "custom" ? customTo : end;
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && dateNumber(from) <= dateNumber(to) && dateNumber(to) - dateNumber(from) <= 3660;
  const dates = validRange ? Array.from({ length: dateNumber(to) - dateNumber(from) + 1 }, (_, i) => dateAt(dateNumber(to) - i)) : [];
  async function perform(action: MealAction) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const data = JSON.stringify(action);
    if (request.current?.data !== data) request.current = { data, id: crypto.randomUUID() };
    try {
      const result = await save({ operationId: request.current.id, actions: [action] });
      if (!result.ok) { setError(result.error); return false; }
      setLocal(result.data.snapshot); setNotice(result.data.message); request.current = null; return true;
    } catch { setError("保存未完成，请重试，当前输入已保留。"); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function execute(action: MealAction) { startTransition(async () => { await perform(action); }); }
  const visibleFoods = state.foods.filter(f => Boolean(f.deletedAt) === showDeleted && `${f.name} ${f.brand ?? ""} ${f.preparation ?? ""}`.toLowerCase().includes(foodQuery.toLowerCase()));
  const deletedMeals = state.meals.filter(m => m.deletedAt);
  return <section className={styles.workspace}>
    <div className={styles.heading}><div><h1>饮食记录</h1><p>每一餐，汇成一天。</p></div><button className={styles.primary} onClick={() => { setError(""); setEditing({ kind: "save_meal", date: selectedDate, mealType: "午餐", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, items: [newItem("misc")] }); }}>记录一餐 <span>＋</span></button></div>
    <div className={styles.tabs}><button aria-pressed={tab === "meals"} onClick={() => setTab("meals")}>饮食</button><button aria-pressed={tab === "foods"} onClick={() => setTab("foods")}>食材库</button></div>
    {error && !editing && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.hint}>{notice}</p>}
    {operations.filter(op => op.status === "pending" && op.origin !== "manual").map(op => <LoadingLink key={op.id} className={styles.reviewLink} href={op.confirmationPath}>{op.origin === "initialization" ? "历史初始化" : "AI 饮食预览"} · {op.rows.length} 项待确认 <span>查看 →</span></LoadingLink>)}
    {tab === "meals" ? <>
      <div className={styles.daySelector}><button aria-label="前一天" onClick={() => setSelectedDate(dateAt(dateNumber(selectedDate) - 1))}>←</button><input aria-label="查看日期" type="date" value={selectedDate} onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }} /><button aria-label="后一天" onClick={() => setSelectedDate(dateAt(dateNumber(selectedDate) + 1))}>→</button><button onClick={() => setSelectedDate(today)}>今天</button><span>{chosen ? `${chosen.meals.length} 餐已记录` : "未记录"}</span></div>
      <MetricValues totals={chosen?.totals ?? { values: emptyNutrition(), incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } }} />
      <section className={styles.trend} aria-label="饮食趋势"><div className={styles.toolbar}><div className={styles.metricTabs}>{metrics.map(m => <button aria-pressed={metric === m} key={m} onClick={() => setMetric(m)}>{metricLabels[m]}</button>)}</div><div className={styles.rangeTabs}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([value, label]) => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}</div></div>
        {range === "custom" && <div className={styles.toolbar}><label>开始<input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label><label>结束<input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></label></div>}
        {validRange ? <NutritionChart dates={[...dates].reverse()} groups={groups} metric={metric} selectedDate={selectedDate} select={date => { setSelectedDate(date); setExpandedDate(date); }} /> : <p className={styles.hint}>请选择有效日期区间，最长10年。</p>}
        <p className={styles.hint}>仅统计已记录摄入；无记录日期留空，缺项显示已知合计。</p>
      </section>
      <div className={styles.tableHeading}><h2>餐次记录</h2><button aria-pressed={showDeleted} onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? "返回有效记录" : "已删除"}</button></div>
      {showDeleted ? <div>{deletedMeals.map(m => <div className={styles.foodRow} key={m.id}><div><strong>{m.date} · {m.mealType}</strong><p>{m.notes}</p></div><button disabled={busy} onClick={() => execute({ kind: "restore_meal", id: m.id, version: m.version })}>恢复</button></div>)}{!deletedMeals.length && <p className={styles.hint}>没有已删除餐次。</p>}</div> : <div className={styles.days}>
        <div className={styles.dayRow + " " + styles.columnLabels}><span>日期</span>{metrics.map(m => <span key={m}>{metricLabels[m]} <small>{unitFor(m)}</small></span>)}<span /></div>
        {dates.map(date => { const day = groups.find(d => d.date === date), open = date === expandedDate; return <div className={styles.day} key={date} data-date={date}><button className={styles.dayRow} aria-expanded={open} onClick={() => { setSelectedDate(date); setExpandedDate(open ? null : date); }}><span>{date}<small>{day ? `${day.meals.length} 餐` : "未记录"}</small></span>{metrics.map(m => <span key={m}>{formatNutrition(day?.totals.values[m] ?? null, m)}{day?.totals.incomplete[m] && <small>部分</small>}</span>)}<span className={styles.chevron}>{open ? "−" : "＋"}</span></button>
          {open && <div className={styles.dayMeals}>{day ? day.meals.map(m => <article className={styles.meal} key={m.id}><div className={styles.mealHeading}><h3>{m.mealType}</h3><span>{m.source === "initialization" ? "初始化 · 整餐估算" : m.items.some(i => i.sourceKind === "estimated") ? "含预估" : "已记录"}</span><button disabled={busy} onClick={() => { setError(""); setEditing({ kind: "save_meal", id: m.id, version: m.version, date: m.date, mealType: m.mealType, notes: m.notes, timezone: m.timezone, occurredAt: m.occurredAt, items: m.items.map(i => i.foodId ? { kind: i.kind, name: i.name, quantity: i.quantity, unit: i.unit, foodId: i.foodId, foodVersion: i.foodVersion, sourceKind: i.sourceKind } : { kind: i.kind, name: i.name, quantity: i.quantity, unit: i.unit, nutrition: i.nutrition, sourceKind: i.sourceKind, basis: i.basis, evidenceUrl: i.evidenceUrl }) }); }}>编辑</button><button disabled={busy} onClick={() => execute({ kind: "delete_meal", id: m.id, version: m.version })}>删除</button></div><MetricValues totals={m.totals} compact /><details><summary>食物与备注</summary>{m.items.filter(i => i.kind !== "whole").map((i, index) => <div className={styles.itemDetail} key={index}><strong>{i.name} {i.quantity ? `${Number(i.quantity)}${i.unit ?? ""}` : ""}</strong><span>{sourceLabels[i.sourceKind]}</span><MetricValues totals={{ values: i.nutrition, incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } }} compact />{i.basis && <p>{i.basis}</p>}{i.evidenceUrl && <a href={i.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</div>)}<p className={styles.notes}>{m.notes || "无备注"}</p></details></article>) : <p className={styles.hint}>这一天未记录。点击“记录一餐”开始。</p>}</div>}
        </div>; })}
        {!state.meals.some(m => !m.deletedAt) && <p className={styles.hint}>还没有饮食记录。可以先记整餐估算，也可以选择食材后填写数量。</p>}
      </div>}
    </> : <>
      <div className={styles.toolbar}><input aria-label="搜索食材" placeholder="搜索名称、品牌或做法" value={foodQuery} onChange={e => setFoodQuery(e.target.value)} /><button aria-pressed={showDeleted} onClick={() => setShowDeleted(!showDeleted)}>{showDeleted ? "有效食材" : "已停用"}</button><button className={styles.primary} onClick={() => { setError(""); setEditing({ kind: "save_food", name: "", brand: null, preparation: null, baseQuantity: "1", unit: "份", nutrition: emptyNutrition(), sourceKind: "label" }); }}>添加食材 ＋</button></div>
      {visibleFoods.map(f => <div className={styles.foodRow} key={f.id}><div><strong>{f.name}</strong><p>{[f.brand, f.preparation, `${Number(f.baseQuantity)}${f.unit}`, sourceLabels[f.sourceKind]].filter(Boolean).join(" · ")}</p><MetricValues totals={{ values: f.nutrition, incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } }} compact /></div><div className={styles.actions}>{!f.deletedAt && <button onClick={() => { setError(""); setEditing({ kind: "save_food", ...f, deletedAt: undefined } as MealAction); }}>编辑</button>}<button disabled={busy} onClick={() => execute({ kind: f.deletedAt ? "restore_food" : "delete_food", id: f.id, version: f.version })}>{f.deletedAt ? "恢复" : "停用"}</button></div></div>)}
      {!visibleFoods.length && <p className={styles.empty}>还没有匹配的食材。添加一款确定的产品或常用食材，下次录入直接选择。</p>}
    </>}
    {editing && <EditorDialog title={editing.kind === "save_food" ? "食材规格" : editing.id ? "编辑餐次" : "记录一餐"} close={() => { if (!busy) { setEditing(null); setError(""); } }} busy={busy}>{editing.kind === "save_food" ? <FoodEditor initial={editing} error={error} busy={busy} save={async f => { const { id, version, name, brand, preparation, baseQuantity, unit, nutrition, sourceKind, basis, evidenceUrl } = f; if (await perform({ kind: "save_food", ...(id ? { id, version } : {}), name, brand, preparation, baseQuantity, unit, nutrition, sourceKind, basis, evidenceUrl })) setEditing(null); }} /> : editing.kind === "save_meal" ? <MealEditor historicalFoods={state.meals.find(m => m.id === editing.id)?.items.flatMap(i => i.foodSnapshot ? [i.foodSnapshot] : []) ?? []} initial={editing} foods={state.foods} error={error} busy={busy} save={async m => { if (await perform({ kind: "save_meal", ...m })) setEditing(null); }} /> : null}</EditorDialog>}
  </section>;
}
function NutritionChart({ dates, groups, metric, selectedDate, select }: { dates: string[]; groups: ReturnType<typeof dailyTotals>; metric: Metric; selectedDate: string; select: (d: string) => void }) {
  const mobile = useMobileMode();
  const rows = dates.map(date => ({ date, totals: groups.find(g => g.date === date)?.totals })), values = rows.flatMap(r => r.totals?.values[metric] == null ? [] : [Number(r.totals.values[metric])]);
  if (!values.length) return <div className={styles.chartEmpty}>这个区间还没有{metricLabels[metric]}数据</div>;
  const width = mobile ? 320 : 1040, left = mobile ? 45 : 65, right = mobile ? 20 : 35;
  const max = Math.max(1, ...values) * 1.12, x = (i: number) => dates.length === 1 ? (width + left - right) / 2 : left + i / (dates.length - 1) * (width - left - right), y = (n: number) => 185 - n / max * 145;
  return <svg className={styles.chart} viewBox={`0 0 ${width} 230`} role="img" aria-label={`${metricLabels[metric]}趋势，单位${unitFor(metric)}`}>
    {[0, 1, 2, 3].map(i => <g key={i}><line className={styles.grid} x1={left} x2={width - right} y1={y(max * i / 3)} y2={y(max * i / 3)} /><text className={styles.axis} x={left - 10} y={y(max * i / 3) + 4} textAnchor="end">{Math.round(max * i / 3)}</text></g>)}
    {rows.map((r, i) => { const value = r.totals?.values[metric], previous = rows[i - 1], previousValue = previous?.totals?.values[metric]; if (value == null) return null; return <g key={r.date}>
      {previousValue != null && !previous.totals?.incomplete[metric] && !r.totals?.incomplete[metric] && <line className={styles.line} x1={x(i - 1)} y1={y(Number(previousValue))} x2={x(i)} y2={y(Number(value))} />}
      <g role="button" tabIndex={0} aria-pressed={r.date === selectedDate} aria-label={`${r.date} ${metricLabels[metric]} ${formatNutrition(value, metric)} ${unitFor(metric)}${r.totals?.incomplete[metric] ? "，数据不完整" : ""}`} onClick={() => select(r.date)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); select(r.date); } }}><title>{r.date} · {formatNutrition(value, metric)} {unitFor(metric)}</title><circle className={styles.point} cx={x(i)} cy={y(Number(value))} r={r.date === selectedDate ? 5 : 3} data-incomplete={Boolean(r.totals?.incomplete[metric])} /><circle className={styles.hit} cx={x(i)} cy={y(Number(value))} r="15" /></g>
    </g>; })}
    {Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])).map(i => <text key={i} className={styles.axis} x={x(i)} y="217" textAnchor="middle">{dates[i].slice(5)}</text>)}
  </svg>;
}
export function EditorDialog({ title, close, busy, children }: { title: string; close: () => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), [closing, setClosing] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const node = ref.current!, previous = document.activeElement, unlock = lockPageScroll(); node.showModal(); return () => { if (timer.current) clearTimeout(timer.current); node.close(); unlock(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  function requestClose() { if (busy || closing) return; if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) close(); else { setClosing(true); timer.current = setTimeout(close, 240); } }
  return <dialog ref={ref} className={styles.drawer} data-closing={closing} aria-labelledby="meal-editor-title" onCancel={e => { e.preventDefault(); requestClose(); }} onClick={e => { if (e.target === ref.current) requestClose(); }}><div className={styles.drawerContent}><div className={styles.heading}><h2 id="meal-editor-title">{title}</h2><button aria-label="关闭编辑" disabled={busy} onClick={requestClose}>×</button></div>{children}</div></dialog>;
}
function NutritionFields({ value, change, readOnly = false }: { value: Nutrition; change: (v: Nutrition) => void; readOnly?: boolean }) {
  return <div className={styles.nutritionFields}>{metrics.map(m => <label key={m}>{metricLabels[m]} <small>{unitFor(m)}</small><input aria-label={metricLabels[m]} type="number" min="0" max="1000000" step="0.0001" inputMode="decimal" readOnly={readOnly} placeholder="未知" value={value[m] ?? ""} onChange={e => change({ ...value, [m]: e.target.value || null })} /></label>)}</div>;
}
function SourceFields({ value, change }: { value: { sourceKind: FoodDraft["sourceKind"]; basis?: string | null; evidenceUrl?: string | null }; change: (v: typeof value) => void }) {
  return <div className={styles.sourceFields}><label>营养依据<select aria-label="营养依据" value={value.sourceKind} onChange={e => change({ ...value, sourceKind: e.target.value as FoodDraft["sourceKind"] })}>{Object.entries(sourceLabels).filter(([key]) => key !== "initialization").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>依据／备注<textarea rows={2} value={value.basis ?? ""} placeholder="标签转录、调研依据或估算说明" onChange={e => change({ ...value, basis: e.target.value || null })} /></label><label>来源链接（可选）<input type="url" value={value.evidenceUrl ?? ""} onChange={e => change({ ...value, evidenceUrl: e.target.value || null })} /></label></div>;
}
export function MealEditor({ initial, foods, historicalFoods = [], submitLabel = "保存餐次", error, busy, save }: { initial: MealDraft; foods: FoodView[]; historicalFoods?: FoodView[]; submitLabel?: string; error: string; busy: boolean; save: (input: MealDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<MealDraft>(() => structuredClone(initial));
  function setItem(index: number, item: ItemDraft) { setDraft(d => ({ ...d, items: d.items.map((i, n) => n === index ? item : i) })); }
  return <form className={styles.form} aria-busy={busy} onSubmit={e => { e.preventDefault(); const { id, version, date, mealType, notes, timezone, occurredAt, items, allowDuplicate } = draft; void save({ ...(id ? { id, version } : {}), date, mealType, notes, timezone, occurredAt, items, allowDuplicate }); }}><fieldset disabled={busy}>
    <div className={styles.formColumns}><label>日期<input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value, occurredAt: null })} /></label><label>餐次<input aria-label="餐次" list="meal-types" required maxLength={50} value={draft.mealType} onChange={e => setDraft({ ...draft, mealType: e.target.value })} /><datalist id="meal-types">{["早餐", "午餐", "晚餐", "加餐", "夜宵"].map(m => <option key={m}>{m}</option>)}</datalist></label></div>
    {draft.items.map((item, index) => { const selectedFood = item.foodId ? historicalFoods.find(f => f.id === item.foodId && f.version === item.foodVersion) ?? foods.find(f => f.id === item.foodId) : item.foodDraft, suggestions = foods.filter(f => !f.deletedAt && `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(item.name.toLowerCase())).slice(0, 8); let shown = item.nutrition ?? emptyNutrition(); if (selectedFood && item.quantity && decimal.safeParse(item.quantity).success && Number(item.quantity)>0 && decimal.safeParse(selectedFood.baseQuantity).success && Number(selectedFood.baseQuantity)>0) shown = nutritionFor(selectedFood, item.quantity); return <section className={styles.itemEditor} key={index}>
      <div className={styles.itemTop}><label>记录类型<select aria-label="记录类型" value={item.kind} onChange={e => setItem(index, newItem(e.target.value as ItemDraft["kind"]))}><option value="food">具体食物</option><option value="misc">杂（剩余食物）</option><option value="whole">整餐估算</option></select></label>{draft.items.length > 1 && <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, n) => n !== index) })}>移除 ×</button>}</div>
      {item.kind === "food" && <><label>食物名称<input required maxLength={200} value={item.name} placeholder="搜索食材，或手动记录食物" onChange={e => setItem(index, item.foodDraft ? { ...item, name: e.target.value, foodDraft: { ...item.foodDraft, name: e.target.value } } : { kind: "food", name: e.target.value, quantity: item.quantity, unit: item.unit, sourceKind: "estimated", nutrition: emptyNutrition() })} /></label>{!selectedFood && suggestions.length > 0 && <div className={styles.suggestions} aria-label="食材建议">{suggestions.map(f => <button type="button" key={f.id} onClick={() => setItem(index, { kind: "food", name: f.name, quantity: "1", unit: f.unit, foodId: f.id, foodVersion: f.version, sourceKind: f.sourceKind })}>{f.name}<small>{[f.brand, `${Number(f.baseQuantity)}${f.unit}`, sourceLabels[f.sourceKind]].filter(Boolean).join(" · ")}</small></button>)}</div>}</>}
      <div className={styles.formColumns}><label>数量<input type="number" min="0.0001" max="1000000" step="0.0001" inputMode="decimal" value={item.quantity ?? ""} placeholder="未知" onChange={e => setItem(index, { ...item, quantity: e.target.value || null })} /></label><label>单位<input list="food-units" readOnly={Boolean(selectedFood)} value={item.unit ?? ""} placeholder="份／只／包／g" onChange={e => setItem(index, { ...item, unit: e.target.value || null })} /></label></div>
      <p className={styles.hint}>{selectedFood ? `${selectedFood.brand ?? ""} · ${sourceLabels[selectedFood.sourceKind]} · 按所选食材规格换算` : item.kind === "misc" ? "填写未单列食物的营养合计，内容写在下方餐次备注。" : item.kind === "whole" ? "本餐直接填写整餐估算，具体吃了什么写在备注。" : "填写这项食物实际吃下的营养，未知可留空。"}</p>
      <NutritionFields value={shown} readOnly={Boolean(selectedFood)} change={nutrition => setItem(index, { ...item, nutrition })} />
      {!selectedFood && <SourceFields value={item} change={fields => setItem(index, { ...item, ...fields })} />}
      {item.foodDraft && <details><summary>修改新食材规格与营养</summary><div className={styles.formColumns}><label>营养对应数量<input type="number" min="0.0001" step="0.0001" value={item.foodDraft.baseQuantity} onChange={e => setItem(index,{...item,foodDraft:{...item.foodDraft!,baseQuantity:e.target.value}})}/></label><label>基准单位<input value={item.foodDraft.unit} onChange={e => setItem(index,{...item,unit:e.target.value,foodDraft:{...item.foodDraft!,unit:e.target.value}})}/></label></div><NutritionFields value={item.foodDraft.nutrition} change={nutrition=>setItem(index,{...item,foodDraft:{...item.foodDraft!,nutrition}})}/><SourceFields value={item.foodDraft} change={fields=>setItem(index,{...item,foodDraft:{...item.foodDraft!,...fields}})}/></details>}
    </section>; })}
    <datalist id="food-units">{["份", "只", "块", "包", "碗", "杯", "g", "ml", "餐"].map(u => <option key={u}>{u}</option>)}</datalist>
    {!draft.items.some(i => i.kind === "whole") && <div className={styles.actions}><button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, newItem("food")] })}>＋ 添加食物</button>{!draft.items.some(i => i.kind === "misc") && <button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, newItem("misc")] })}>＋ 添加杂</button>}</div>}
    <label>餐次备注<textarea rows={4} maxLength={12000} value={draft.notes ?? ""} placeholder="吃了哪些东西、食用比例、照片分析说明…" onChange={e => setDraft({ ...draft, notes: e.target.value || null })} /></label>
    {(error.includes("相同") || draft.allowDuplicate) && <label className={styles.checkbox}><input type="checkbox" checked={Boolean(draft.allowDuplicate)} onChange={e => setDraft({ ...draft, allowDuplicate: e.target.checked })} />这是另一次进食，仍然新增</label>}
    {error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.save} type="submit">{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
export function FoodEditor({ initial, submitLabel = "保存食材", error, busy, save }: { initial: FoodDraft; submitLabel?: string; error: string; busy: boolean; save: (f: FoodDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<FoodDraft>(() => structuredClone(initial));
  return <form className={styles.form} aria-busy={busy} onSubmit={e => { e.preventDefault(); void save(draft); }}><fieldset disabled={busy}>
    <label>食材／产品名称<input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className={styles.formColumns}><label>品牌（可选）<input value={draft.brand ?? ""} onChange={e => setDraft({ ...draft, brand: e.target.value || null })} /></label><label>规格／做法（可选）<input placeholder="口味、净重、生／熟…" value={draft.preparation ?? ""} onChange={e => setDraft({ ...draft, preparation: e.target.value || null })} /></label></div>
    <div className={styles.formColumns}><label>营养对应数量<input type="number" min="0.0001" max="1000000" step="0.0001" required value={draft.baseQuantity} onChange={e => setDraft({ ...draft, baseQuantity: e.target.value })} /></label><label>单位<input required maxLength={30} placeholder="包／只／份／g／ml" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label></div>
    <p className={styles.hint}>例如每1包、每1只或每100g对应下方营养。以后选择食材并填写数量，自动换算。</p><NutritionFields value={draft.nutrition} change={nutrition => setDraft({ ...draft, nutrition })} /><SourceFields value={draft} change={fields => setDraft({ ...draft, ...fields })} />
    {error && <p role="alert" className={styles.error}>{error}</p>}<button type="submit" className={styles.save}>{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
