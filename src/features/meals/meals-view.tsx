"use client";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { lockPageScroll } from "@/components/scroll-lock";
import { usePageLoading } from "@/components/page-loading-state";
import { useMobileMode } from "@/components/use-mobile-mode";
import { dailyTotals, suggestedMealType, mealOperationStatus, emptyNutrition, formatNutrition, metricLabels, metrics, type FoodDraft, type MealAction,  type MealInput, type MacroMode, type MealOperationView, type MealSnapshot, type MealView, type Metric,  type Result, type Totals } from "./model";
import { recentRecordDates, recordDateLabel } from "@/components/record-dates";
import { useLocalToday } from "@/components/use-local-today";
import { FoodDetails, FoodTable } from "./presets";
import { ImageGallery, PhotoFields } from "./photos";
import { MealEvidence, NutritionTable } from "./review-details";
import { MealDayControl } from "./meal-day-control";
import type { MealDayInput } from "./model";
import { NutritionChart } from "./nutrition-chart";
import { DraftCloseContext, DraftGuardContext, useDraftGuard, type DraftState } from "@/components/draft-guard";
import { useBackdropDismiss } from "@/components/use-backdrop-dismiss";
import { NutritionFields, SourceFields } from "./nutrition-fields";
import { MealEditor } from "./meal-editor";
export { MealEditor } from "./meal-editor";
import { useOperationClock } from "./use-operation-clock";
import styles from "./meals.module.css";

export type SaveMeals = (input: MealInput, allowMissingImages?: boolean) => Promise<Result<{ snapshot: MealSnapshot; message: string }>>;
const unitFor = (metric: Metric) => metric === "caloriesKcal" ? "kcal" : "g";
const dateNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const dateAt = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
function MetricValues({ totals, compact = false }: { totals: Totals; compact?: boolean }) {
  return <div className={compact ? styles.compactMetrics : styles.summary}>{metrics.map(metric => <div key={metric}><span>{metricLabels[metric]}</span><strong>{formatNutrition(totals.values[metric], metric)}<small>{unitFor(metric)}</small></strong>{!compact && totals.incomplete[metric] && <p>部分</p>}{compact && totals.incomplete[metric] && <small>部分</small>}</div>)}</div>;
}
export function MealsView({ snapshot, today: initialToday, operations, save, saveDay, purge, initialDate = null }: { snapshot: MealSnapshot; today: string; operations: MealOperationView[]; save: SaveMeals; saveDay?: (input: MealDayInput) => ReturnType<SaveMeals>; purge: (input: import("./recently-deleted").PermanentDeletion) => ReturnType<SaveMeals>; initialDate?: string|null }) {
  const today=useLocalToday(initialToday), now=useOperationClock();
  const [local,setLocal]=useState<MealSnapshot|null>(null),[base,setBase]=useState(snapshot);
  if(snapshot!==base){setBase(snapshot);setLocal(null);}
  const state=local??snapshot,mobile=useMobileMode(),[tab,setTab]=useState<"meals"|"foods">("meals");
  const [selectedDate,setSelectedDate]=useState(initialDate??today),[historyOpen,setHistoryOpen]=useState(Boolean(initialDate)),[rangeChoice,setRange]=useState<string|null>(null);
  const range=rangeChoice??(mobile?"7":"30"),[customFrom,setCustomFrom]=useState(""),[customTo,setCustomTo]=useState(today);
  const [editing,setEditing]=useState<MealAction|null>(null),[showDeleted,setShowDeleted]=useState(false),[foodQuery,setFoodQuery]=useState("");
  const [foodCategory,setFoodCategory]=useState("all"),[purgeTarget,setPurgeTarget]=useState<{id:string;version:number;recordType:"meal"|"food";name:string}|null>(null);
  const [calendarDate,setCalendarDate]=useState("");
  const [macroMode,setMacroMode]=useState<MacroMode>("grams");
  const [viewingFood,setViewingFood]=useState<FoodDraft|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[pending,startTransition]=useTransition(),[busy,setBusy]=useState(false);
  const busyRef=useRef(false),request=useRef<{data:string;id:string}|null>(null);
  usePageLoading({active:pending||busy,label:"正在保存饮食记录…"});
  const groups=dailyTotals(state.meals),chosen=groups.find(d=>d.date===today),end=groups[0]?.date>today?groups[0].date:today;
  const first=groups.at(-1)?.date??today,from=range==="all"?first:range==="custom"?customFrom:dateAt(dateNumber(end)-Number(range)+1),to=range==="custom"?customTo:end;
  const validRange=/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&dateNumber(from)<=dateNumber(to)&&dateNumber(to)-dateNumber(from)<=3660;
  const dates=validRange?Array.from({length:dateNumber(to)-dateNumber(from)+1},(_,i)=>dateAt(dateNumber(from)+i)):[];
  async function perform(action:MealAction, allowMissingImages = false){
    if(busyRef.current)return false;busyRef.current=true;setBusy(true);setError("");setNotice("");
    const data=JSON.stringify(action);if(request.current?.data!==data)request.current={data,id:crypto.randomUUID()};
    try{const result=await save({operationId:request.current.id,actions:[action]},allowMissingImages);if(!result.ok){setError(result.error);return false;}setLocal(result.data.snapshot);setNotice(result.data.message);request.current=null;return true;}
    catch{setError("保存未完成，请重试，当前输入已保留。");return false;}finally{busyRef.current=false;setBusy(false);}
  }
  async function performDay(input: MealDayInput) {
    if (!saveDay || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveDay(input);
      if (!result.ok) { setError(result.error); return false; }
      setLocal(result.data.snapshot); setNotice(result.data.message); return true;
    } catch { setError("当天记录状态未保存，请重试。"); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function execute(action:MealAction){startTransition(async()=>{await perform(action);});}
  function addMeal(date:string){setError("");setEditing({kind:"save_meal",date,mealType:suggestedMealType(new Date().getHours()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]});}
  function editMeal(m:MealView){setError("");setEditing({kind:"save_meal",id:m.id,version:m.version,date:m.date,mealType:m.mealType,notes:m.notes,timezone:m.timezone,occurredAt:m.occurredAt,imageIds:m.imageIds,items:m.items.map(i=>i.foodId||i.foodSnapshot?{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.quantity?i.amountDecision:"unknown_accepted",foodId:i.foodId,foodVersion:i.foodVersion,sourceKind:i.sourceKind,basis:i.basis,reviewExplanation:i.reviewExplanation}:{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.amountDecision,nutrition:i.nutrition,sourceKind:i.sourceKind,basis:i.basis,evidenceUrl:i.evidenceUrl,reviewExplanation:i.reviewExplanation})});}
  async function confirmPurge(){
    if(!purgeTarget||busyRef.current)return;busyRef.current=true;setBusy(true);setError("");
    const {name,...target}=purgeTarget;void name;const data=JSON.stringify({purge:target});if(request.current?.data!==data)request.current={data,id:crypto.randomUUID()};
    try{const result=await purge({...target,operationId:request.current.id});if(!result.ok){setError(result.error);return;}setLocal(result.data.snapshot);setNotice(result.data.message);setPurgeTarget(null);request.current=null;}catch{setError("删除未完成，请重试。");}finally{busyRef.current=false;setBusy(false);}
  }
  const visibleFoods=state.foods.filter(f=>!f.deletedAt&&(foodCategory==="all"||(f.category??"ingredient")===foodCategory)&&`${f.name} ${f.brand??""} ${f.preparation??""}`.toLowerCase().includes(foodQuery.toLowerCase()));
  return <section className={styles.workspace}>
    <div className={styles.heading}><div><h1>饮食记录</h1><p>每一餐，汇成一天。</p></div><button className={styles.primary} onClick={()=>addMeal(today)}>记录一餐 <span>＋</span></button></div>
    <div className={styles.tabs}><button aria-pressed={tab==="meals"} onClick={()=>{setTab("meals");setShowDeleted(false);}}>饮食</button><button aria-pressed={tab==="foods"} onClick={()=>{setTab("foods");setShowDeleted(false);}}>食材库</button><button className={styles.trashEntry} onClick={()=>{setError("");setShowDeleted(true);}}>最近删除</button></div>
    {error&&!editing&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.hint}>{notice}</p>}
    {operations.filter(op=>mealOperationStatus(op,now)==="pending"&&op.origin!=="manual").map(op=><LoadingLink key={op.id} className={styles.reviewLink} href={op.confirmationPath}>{op.origin==="initialization"?"历史初始化":"AI 饮食预览"} · {op.rows.length} 项待确认 <span>查看 →</span></LoadingLink>)}
    {tab==="meals"?<>
      <div className={styles.todayHeading}><span>今天 · <time dateTime={today}>{today.replaceAll("-",".")}</time></span><span>{chosen?`${chosen.meals.length} 餐已记录`:"未记录"}</span></div>
      <MetricValues totals={chosen?.totals??{values:emptyNutrition(),incomplete:{caloriesKcal:false,proteinG:false,carbsG:false,fatG:false}}}/>
      <section className={styles.trend} aria-label="饮食趋势"><div className={styles.toolbar}><h2 className={styles.trendTitle}>每日摄入 <small>kcal</small></h2><div className={styles.rangeTabs}>{[["7","7D"],["30","30D"],["90","90D"],["all","全部"],["custom","自定义"]].map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>setRange(value)}>{label}</button>)}</div></div>
        {range==="custom"&&<div className={styles.toolbar}><label>开始<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>结束<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></div>}
        {validRange?<NutritionChart key={`${from}:${to}`} dates={dates} groups={groups} mode={macroMode} setMode={setMacroMode} select={date=>{setSelectedDate(date);setShowDeleted(false);setHistoryOpen(true);}}/>:<p className={styles.hint}>请选择有效日期区间，最长10年。</p>}
        </section>
      <div className={styles.tableHeading}><h2>每日记录</h2><label className={styles.calendarPicker}>查看日期<input aria-label="饮食记录日期" type="date" max={today} value={calendarDate} onChange={event=>setCalendarDate(event.target.value)}/></label><button onClick={()=>{setSelectedDate(today);setShowDeleted(false);setHistoryOpen(true);}}>历史记录 →</button></div>
      <div>{[...new Set([...recentRecordDates(today),...(calendarDate?[calendarDate]:[])])].sort().reverse().map(date=>{
        const group=groups.find(day=>day.date===date);
        return <section className={styles.calendarDay} key={date} data-meal-day={date}><div className={styles.calendarRow}><div><time dateTime={date}>{recordDateLabel(date,today)}</time><p>{group ? group.meals.length+" 餐" : "未记录"}</p></div><strong>{formatNutrition(group?.totals.values.caloriesKcal??null,"caloriesKcal")} <small>kcal{group?.totals.incomplete.caloriesKcal?" · 部分":""}</small></strong><button onClick={()=>addMeal(date)}>{group?"添加一餐":date<today?"补录":"录入"}</button></div>
        {group && saveDay && <MealDayControl day={group.day} busy={busy} save={performDay}/>}
        {group && <details open={date===today||date===calendarDate}><summary>餐次详情</summary><MealList meals={group.meals} busy={busy} edit={editMeal} remove={meal=>execute({kind:"delete_meal",id:meal.id,version:meal.version})}/></details>}</section>;
      })}</div>
    </>:<>
      <div className={styles.categoryTabs}>{[["all","全部"],["meal","整餐"],["ingredient","食材"]].map(([key,label])=><button key={key} aria-pressed={foodCategory===key} onClick={()=>setFoodCategory(key)}>{label}</button>)}</div><div className={styles.toolbar}><input aria-label="搜索食材" placeholder="搜索名称、品牌或做法" value={foodQuery} onChange={e=>setFoodQuery(e.target.value)}/><button className={styles.primary} onClick={()=>{setError("");setEditing({kind:"save_food",name:"",brand:null,preparation:null,baseQuantity:"1",unit:"份",nutrition:emptyNutrition(),sourceKind:"reference"});}}>添加食材 ＋</button></div>
      {visibleFoods.length ? <FoodTable foods={visibleFoods} details={setViewingFood} actions={f=><><button onClick={()=>{setError("");setEditing({kind:"save_food",...f});}}>编辑</button><button disabled={busy} onClick={()=>execute({kind:"delete_food",id:f.id,version:f.version})}>删除</button></>}/> : <p className={styles.hint}>还没有匹配的条目，可以添加食材或整餐。</p>}
    </>}
    {historyOpen&&<EditorDialog title="历史饮食记录" close={()=>setHistoryOpen(false)} busy={busy}><div className={styles.toolbar}><label>查看日期<input aria-label="查看日期" type="date" value={selectedDate} onChange={e=>{if(e.target.value)setSelectedDate(e.target.value);}}/></label><button onClick={()=>{setSelectedDate(today);setHistoryOpen(false);}}>回到今天</button></div><MetricValues totals={groups.find(d=>d.date===selectedDate)?.totals??{values:emptyNutrition(),incomplete:{caloriesKcal:false,proteinG:false,carbsG:false,fatG:false}}} compact/>{saveDay && groups.find(group=>group.date===selectedDate) && <MealDayControl day={groups.find(group=>group.date===selectedDate)!.day} busy={busy} save={performDay}/>}<button className={styles.primary} onClick={()=>addMeal(selectedDate)}>补录这一餐 ＋</button><MealList expanded meals={groups.find(d=>d.date===selectedDate)?.meals??[]} busy={busy} edit={editMeal} remove={m=>execute({kind:"delete_meal",id:m.id,version:m.version})}/>
    </EditorDialog>}
    {showDeleted&&<EditorDialog title="最近删除" close={()=>{setShowDeleted(false);setError("");}} busy={busy}>
      <p className={styles.hint}>恢复后重新显示；永久删除后无法恢复。</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
      {(["meal","food"] as const).map(recordType=><section key={recordType}><h3>{recordType==="meal"?"餐次":"食材库"}</h3>{(recordType==="meal"?state.meals:state.foods).filter(row=>row.deletedAt).map(row=>{const name="mealType" in row?`${row.date} · ${row.mealType}`:row.name;return <div className={styles.foodRow} key={row.id}><strong>{name}</strong><div className={styles.actions}><button disabled={busy} onClick={()=>execute({kind:recordType==="meal"?"restore_meal":"restore_food",id:row.id,version:row.version})}>恢复</button><button disabled={busy} onClick={()=>{setError("");setPurgeTarget({id:row.id,version:row.version,recordType,name});}}>永久删除</button></div></div>;})}</section>)}
      {![...state.meals,...state.foods].some(row=>row.deletedAt)&&<p className={styles.hint}>最近删除为空。</p>}
    </EditorDialog>}
    {purgeTarget&&<EditorDialog title="永久删除" close={()=>setPurgeTarget(null)} busy={busy}><p>永久删除“{purgeTarget.name}”？</p><p className={styles.hint}>此操作无法恢复。{purgeTarget.recordType==="food"?"旧餐的营养、用量、历史规格和照片继续保留。":"原始导入和审计记录继续保留。"}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button disabled={busy} onClick={()=>setPurgeTarget(null)}>取消</button><button disabled={busy} onClick={()=>void confirmPurge()}>{busy?"正在删除…":"确认永久删除"}</button></div></EditorDialog>}
    {viewingFood&&<EditorDialog title="食材详情" close={()=>setViewingFood(null)} busy={false}><FoodDetails food={viewingFood}/><div className={styles.actions}><button onClick={()=>{setEditing({kind:"save_food",...viewingFood});setViewingFood(null);}}>编辑</button>{viewingFood.id&&<button disabled={busy} onClick={()=>{execute({kind:"delete_food",id:viewingFood.id!,version:viewingFood.version!});setViewingFood(null);}}>删除</button>}</div></EditorDialog>}
    {editing&&<EditorDialog wide={editing.kind==="save_meal"} title={editing.kind==="save_food"?"食材规格":editing.id?"编辑餐次":"记录一餐"} close={()=>{if(!busy){setEditing(null);setError("");}}} busy={busy}>{editing.kind==="save_food"?<FoodEditor initial={editing} error={error} busy={busy} save={async (f,allowMissingImages)=>{if(await perform({kind:"save_food",...f},allowMissingImages))setEditing(null);}}/>:editing.kind==="save_meal"?<MealEditor historicalItems={state.meals.find(m=>m.id===editing.id)?.items??[]} historicalFoods={state.meals.find(m=>m.id===editing.id)?.items.flatMap(i=>i.foodSnapshot?[i.foodSnapshot]:[])??[]} initial={editing} foods={state.foods} error={error} busy={busy} save={async (m,allowMissingImages)=>{if(await perform({kind:"save_meal",...m},allowMissingImages))setEditing(null);}}/>:null}</EditorDialog>}
  </section>;
}
function MealList({meals,busy,edit,remove,expanded=false}:{meals:MealView[];busy:boolean;edit:(m:MealView)=>void;remove:(m:MealView)=>void;expanded?:boolean}) {
 return <div className={styles.dayMeals}>{meals.map(m=><article className={styles.meal} key={m.id}><div className={styles.mealHeading}><h3>{m.mealType}</h3><span>{m.source==="initialization"?"初始化 · 整餐估算":m.items.some(i=>i.sourceKind==="estimated"||i.amountDecision==="estimate_accepted")?"含预估":"已记录"}</span>{expanded&&<strong className={styles.mealCalories}>{formatNutrition(m.totals.values.caloriesKcal,"caloriesKcal")} <small>kcal</small>{m.totals.incomplete.caloriesKcal&&<small> · 部分</small>}</strong>}<button disabled={busy} onClick={()=>edit(m)}>编辑</button><button disabled={busy} onClick={()=>remove(m)}>删除</button></div>{!expanded&&<MetricValues totals={m.totals} compact/>}<ImageGallery ids={m.imageIds}/><details open={expanded}><summary>食物与备注</summary><NutritionTable items={m.items} saved/><MealEvidence notes={m.notes}/></details></article>)}{!meals.length&&<p className={styles.hint}>这一天还没有饮食记录。</p>}</div>;
}
export function EditorDialog({ title, close, busy, children, wide = false }: { title: string; close: () => void; busy: boolean; children: ReactNode; wide?: boolean }) {
  const titleId=useId();
  const ref = useRef<HTMLDialogElement>(null), [closing, setClosing] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const node = ref.current!, previous = document.activeElement, unlock = lockPageScroll(); node.showModal(); return () => { if (timer.current) clearTimeout(timer.current); node.close(); unlock(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  const drafts = useRef(new Map<symbol, DraftState>());
  const registerDraft = useCallback((state: DraftState) => {
    const key = Symbol(); drafts.current.set(key, state);
    return () => { drafts.current.delete(key); };
  }, []);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (![...drafts.current.values()].some(state => state.dirty)) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  function requestClose() {
    if (busy || closing || [...drafts.current.values()].some(state => state.busy)) return;
    if ([...drafts.current.values()].some(state => state.dirty) && !window.confirm("本次输入尚未提交，关闭会放弃这些改动。已保存的记录和已更新的预览不受影响。确定关闭？")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) close();
    else { setClosing(true); timer.current = setTimeout(close, 240); }
  }
  const backdrop = useBackdropDismiss(requestClose);
  return <dialog {...backdrop} ref={ref} className={`${styles.drawer} ${wide ? styles.wideDrawer : ""}`} data-closing={closing} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); requestClose(); }}><div className={styles.drawerContent}><div className={styles.heading}><h2 id={titleId}>{title}</h2><button aria-label="关闭编辑" disabled={busy} onClick={requestClose}>×</button></div><DraftGuardContext.Provider value={registerDraft}><DraftCloseContext.Provider value={requestClose}>{children}</DraftCloseContext.Provider></DraftGuardContext.Provider></div></dialog>;
}
export function FoodEditor({ initial, submitLabel = "保存食材", error, busy, save }: { initial: FoodDraft; submitLabel?: string; error: string; busy: boolean; save: (f: FoodDraft, allowMissingImages?: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState<FoodDraft>(() => { const {id,version,category,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}=initial;return structuredClone({id,version,category,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}); });
  const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState(""),[textOnly,setTextOnly]=useState(false);
  const [initialSignature] = useState(() => JSON.stringify(draft));
  useDraftGuard(JSON.stringify(draft) !== initialSignature || textOnly, uploading);
  return <form className={styles.form} aria-busy={busy} onSubmit={e => { e.preventDefault(); void save(draft,textOnly); }}><fieldset disabled={busy||uploading}>
    <label>分类<select aria-label="食材分类" value={draft.category??"ingredient"} onChange={e=>setDraft({...draft,category:e.target.value as "meal"|"ingredient"})}><option value="ingredient">食材</option><option value="meal">整餐</option></select></label>
    <label>食材／产品名称<input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className={styles.formColumns}><label>品牌（可选）<input value={draft.brand ?? ""} onChange={e => setDraft({ ...draft, brand: e.target.value || null })} /></label><label>规格／做法（可选）<input placeholder="口味、净重、生／熟…" value={draft.preparation ?? ""} onChange={e => setDraft({ ...draft, preparation: e.target.value || null })} /></label></div>
    <div className={styles.formColumns}><label>营养对应数量<input type="number" min="0.0001" max="1000000" step="0.0001" required value={draft.baseQuantity} onChange={e => setDraft({ ...draft, baseQuantity: e.target.value })} /></label><label>单位<input required maxLength={30} placeholder="包／只／份／g／ml" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label></div>
    <p className={styles.hint}>例如每1包、每1只或每100g对应下方营养。以后选择食材并填写数量，自动换算。</p><NutritionFields value={draft.nutrition} change={nutrition => setDraft({ ...draft, nutrition })} /><SourceFields value={draft} change={fields => setDraft({ ...draft, ...fields })} detailed={submitLabel==="更新预览"} />
    <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(d=>({...d,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(d=>({...d,imageIds}))} busy={busy} onBusy={setUploading} onError={setPhotoError}/>
    {submitLabel!=="更新预览"&&(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<label className={styles.checkbox}><input type="checkbox" checked={textOnly} onChange={e=>setTextOnly(e.target.checked)}/>照片尚未全部保存，先保存文字记录</label>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={uploading||(Boolean(photoError)&&!textOnly)} type="submit" className={styles.save}>{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
