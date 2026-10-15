"use client";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { LoadingLink } from "@/components/loading-link";
import { lockPageScroll } from "@/components/scroll-lock";
import { usePageLoading } from "@/components/page-loading-state";
import { useMobileMode } from "@/components/use-mobile-mode";
import { dailyTotals, mealOperationStatus, emptyNutrition, formatNutrition, metricLabels, metrics, type FoodDraft, type MealAction,  type MealInput, type MealOperationView, type MealSnapshot, type MealView, type Metric,  type Result, type Totals } from "./model";
import { useLocalToday } from "@/components/use-local-today";
import { FoodDetails, FoodPresets, FoodTable } from "./presets";
import { ImageGallery, PhotoFields } from "./photos";
import { MealEvidence, NutritionTable } from "./review-details";
import { NutritionChart } from "./nutrition-chart";
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
  return <div className={compact ? styles.compactMetrics : styles.summary}>{metrics.map(metric => <div key={metric}><span>{metricLabels[metric]}</span><strong>{formatNutrition(totals.values[metric], metric)}<small>{unitFor(metric)}</small></strong>{!compact && <p>{totals.incomplete[metric] ? "已知合计 · 数据不完整" : "已记录摄入"}</p>}{compact && totals.incomplete[metric] && <small>部分</small>}</div>)}</div>;
}
export function MealsView({ snapshot, today: initialToday, operations, save, initialDate = null }: { snapshot: MealSnapshot; today: string; operations: MealOperationView[]; save: SaveMeals; initialDate?: string|null }) {
  const today=useLocalToday(initialToday), now=useOperationClock();
  const [local,setLocal]=useState<MealSnapshot|null>(null),[base,setBase]=useState(snapshot);
  if(snapshot!==base){setBase(snapshot);setLocal(null);}
  const state=local??snapshot,mobile=useMobileMode(),[tab,setTab]=useState<"meals"|"foods">("meals");
  const [selectedDate,setSelectedDate]=useState(initialDate??today),[historyOpen,setHistoryOpen]=useState(Boolean(initialDate)),[rangeChoice,setRange]=useState<string|null>(null);
  const range=rangeChoice??(mobile?"7":"30"),[customFrom,setCustomFrom]=useState(""),[customTo,setCustomTo]=useState(today);
  const [editing,setEditing]=useState<MealAction|null>(null),[showDeleted,setShowDeleted]=useState(false),[foodQuery,setFoodQuery]=useState("");
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
  function execute(action:MealAction){startTransition(async()=>{await perform(action);});}
  function addMeal(date:string){setError("");setEditing({kind:"save_meal",date,mealType:"午餐",timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]});}
  function editMeal(m:MealView){setError("");setEditing({kind:"save_meal",id:m.id,version:m.version,date:m.date,mealType:m.mealType,notes:m.notes,timezone:m.timezone,occurredAt:m.occurredAt,imageIds:m.imageIds,items:m.items.map(i=>i.foodId?{kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.quantity?i.amountDecision:"unknown_accepted",foodId:i.foodId,foodVersion:i.foodVersion,sourceKind:i.sourceKind,basis:i.basis,reviewExplanation:i.reviewExplanation}:{kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.amountDecision,nutrition:i.nutrition,sourceKind:i.sourceKind,basis:i.basis,evidenceUrl:i.evidenceUrl,reviewExplanation:i.reviewExplanation})});}
  const visibleFoods=state.foods.filter(f=>!f.deletedAt&&`${f.name} ${f.brand??""} ${f.preparation??""}`.toLowerCase().includes(foodQuery.toLowerCase()));
  return <section className={styles.workspace}>
    <div className={styles.heading}><div><h1>饮食记录</h1><p>每一餐，汇成一天。</p></div><button className={styles.primary} onClick={()=>addMeal(today)}>记录一餐 <span>＋</span></button></div>
    <div className={styles.tabs}><button aria-pressed={tab==="meals"} onClick={()=>{setTab("meals");setShowDeleted(false);}}>饮食</button><button aria-pressed={tab==="foods"} onClick={()=>{setTab("foods");setShowDeleted(false);}}>食材库</button></div>
    {error&&!editing&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.hint}>{notice}</p>}
    {operations.filter(op=>mealOperationStatus(op,now)==="pending"&&op.origin!=="manual").map(op=><LoadingLink key={op.id} className={styles.reviewLink} href={op.confirmationPath}>{op.origin==="initialization"?"历史初始化":"AI 饮食预览"} · {op.rows.length} 项待确认 <span>查看 →</span></LoadingLink>)}
    {tab==="meals"?<>
      <div className={styles.todayHeading}><span>今天 · <time dateTime={today}>{today.replaceAll("-",".")}</time></span><span>{chosen?`${chosen.meals.length} 餐已记录`:"未记录"}</span></div>
      <MetricValues totals={chosen?.totals??{values:emptyNutrition(),incomplete:{caloriesKcal:false,proteinG:false,carbsG:false,fatG:false}}}/>
      <section className={styles.trend} aria-label="饮食趋势"><div className={styles.toolbar}><h2 className={styles.trendTitle}>每日摄入 <small>kcal</small></h2><div className={styles.rangeTabs}>{[["7","7D"],["30","30D"],["90","90D"],["all","全部"],["custom","自定义"]].map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>setRange(value)}>{label}</button>)}</div></div>
        {range==="custom"&&<div className={styles.toolbar}><label>开始<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>结束<input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></div>}
        {validRange?<NutritionChart key={`${from}:${to}`} dates={dates} groups={groups} select={date=>{setSelectedDate(date);setShowDeleted(false);setHistoryOpen(true);}}/>:<p className={styles.hint}>请选择有效日期区间，最长10年。</p>}
        <p className={styles.hint}>仅统计已记录摄入；无记录日期留空，缺项显示已知合计。点击柱图查看当天餐次。</p></section>
      <div className={styles.tableHeading}><h2>今天的餐次</h2><button onClick={()=>{setSelectedDate(today);setShowDeleted(false);setHistoryOpen(true);}}>历史记录 →</button></div>
      <MealList meals={chosen?.meals??[]} busy={busy} edit={editMeal} remove={m=>execute({kind:"delete_meal",id:m.id,version:m.version})}/>
    </>:<>
      <div className={styles.toolbar}><input aria-label="搜索食材" placeholder="搜索名称、品牌或做法" value={foodQuery} onChange={e=>setFoodQuery(e.target.value)}/><button className={styles.primary} onClick={()=>{setError("");setEditing({kind:"save_food",name:"",brand:null,preparation:null,baseQuantity:"1",unit:"份",nutrition:emptyNutrition(),sourceKind:"reference"});}}>添加食材 ＋</button></div>
      {visibleFoods.length ? <FoodTable foods={visibleFoods} details={setViewingFood} actions={f=><><button onClick={()=>{setError("");setEditing({kind:"save_food",...f});}}>编辑</button><button disabled={busy} onClick={()=>execute({kind:"delete_food",id:f.id,version:f.version})}>删除</button></>}/> : <p className={styles.hint}>还没有匹配的食材，可以添加产品或采用下方基础食材。</p>}
      <FoodPresets query={foodQuery} foods={state.foods} details={setViewingFood} adopt={draft=>{setError("");setEditing({kind:"save_food",...draft});}}/>
      {state.foods.some(f=>f.deletedAt)&&<details className={styles.deletedFoods}><summary>最近删除</summary>{state.foods.filter(f=>f.deletedAt).map(f=><div className={styles.foodRow} key={f.id}><strong>{f.name}</strong><button disabled={busy} onClick={()=>execute({kind:"restore_food",id:f.id,version:f.version})}>恢复</button></div>)}</details>}
    </>}
    {historyOpen&&<EditorDialog title="历史饮食记录" close={()=>setHistoryOpen(false)} busy={busy}><div className={styles.toolbar}><label>查看日期<input aria-label="查看日期" type="date" value={selectedDate} onChange={e=>{if(e.target.value)setSelectedDate(e.target.value);}}/></label><button onClick={()=>{setSelectedDate(today);setHistoryOpen(false);}}>回到今天</button><button aria-pressed={showDeleted} onClick={()=>setShowDeleted(!showDeleted)}>{showDeleted?"有效记录":"已删除"}</button></div>
      {showDeleted?<>{state.meals.filter(m=>m.deletedAt).map(m=><div className={styles.foodRow} key={m.id}><div><strong>{m.date} · {m.mealType}</strong><ImageGallery ids={m.imageIds}/></div><button disabled={busy} onClick={()=>execute({kind:"restore_meal",id:m.id,version:m.version})}>恢复</button></div>)}</>:<><MetricValues totals={groups.find(d=>d.date===selectedDate)?.totals??{values:emptyNutrition(),incomplete:{caloriesKcal:false,proteinG:false,carbsG:false,fatG:false}}} compact/><button className={styles.primary} onClick={()=>addMeal(selectedDate)}>补录这一餐 ＋</button><MealList expanded meals={groups.find(d=>d.date===selectedDate)?.meals??[]} busy={busy} edit={editMeal} remove={m=>execute({kind:"delete_meal",id:m.id,version:m.version})}/></>}
    </EditorDialog>}
    {viewingFood&&<EditorDialog title="食材详情" close={()=>setViewingFood(null)} busy={false}><FoodDetails food={viewingFood}/><div className={styles.actions}><button onClick={()=>{setEditing({kind:"save_food",...viewingFood});setViewingFood(null);}}>{viewingFood.id?"编辑":"采用"}</button>{viewingFood.id&&<button disabled={busy} onClick={()=>{execute({kind:"delete_food",id:viewingFood.id!,version:viewingFood.version!});setViewingFood(null);}}>删除</button>}</div></EditorDialog>}
    {editing&&<EditorDialog wide={editing.kind==="save_meal"} title={editing.kind==="save_food"?"食材规格":editing.id?"编辑餐次":"记录一餐"} close={()=>{if(!busy){setEditing(null);setError("");}}} busy={busy}>{editing.kind==="save_food"?<FoodEditor initial={editing} error={error} busy={busy} save={async (f,allowMissingImages)=>{if(await perform({kind:"save_food",...f},allowMissingImages))setEditing(null);}}/>:editing.kind==="save_meal"?<MealEditor historicalFoods={state.meals.find(m=>m.id===editing.id)?.items.flatMap(i=>i.foodSnapshot?[i.foodSnapshot]:[])??[]} initial={editing} foods={state.foods} error={error} busy={busy} save={async (m,allowMissingImages)=>{if(await perform({kind:"save_meal",...m},allowMissingImages))setEditing(null);}}/>:null}</EditorDialog>}
  </section>;
}
function MealList({meals,busy,edit,remove,expanded=false}:{meals:MealView[];busy:boolean;edit:(m:MealView)=>void;remove:(m:MealView)=>void;expanded?:boolean}) {
 return <div className={styles.dayMeals}>{meals.map(m=><article className={styles.meal} key={m.id}><div className={styles.mealHeading}><h3>{m.mealType}</h3><span>{m.source==="initialization"?"初始化 · 整餐估算":m.items.some(i=>i.sourceKind==="estimated"||i.amountDecision==="estimate_accepted")?"含预估":"已记录"}</span>{expanded&&<strong className={styles.mealCalories}>{formatNutrition(m.totals.values.caloriesKcal,"caloriesKcal")} <small>kcal</small>{m.totals.incomplete.caloriesKcal&&<small> · 部分</small>}</strong>}<button disabled={busy} onClick={()=>edit(m)}>编辑</button><button disabled={busy} onClick={()=>remove(m)}>删除</button></div>{!expanded&&<MetricValues totals={m.totals} compact/>}<ImageGallery ids={m.imageIds}/><details open={expanded}><summary>食物与备注</summary><NutritionTable items={m.items} saved/><MealEvidence notes={m.notes}/></details></article>)}{!meals.length&&<p className={styles.hint}>这一天还没有饮食记录。</p>}</div>;
}
export function EditorDialog({ title, close, busy, children, wide = false }: { title: string; close: () => void; busy: boolean; children: ReactNode; wide?: boolean }) {
  const titleId=useId();
  const ref = useRef<HTMLDialogElement>(null), [closing, setClosing] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { const node = ref.current!, previous = document.activeElement, unlock = lockPageScroll(); node.showModal(); return () => { if (timer.current) clearTimeout(timer.current); node.close(); unlock(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  function requestClose() { if (busy || closing) return; if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) close(); else { setClosing(true); timer.current = setTimeout(close, 240); } }
  const backdrop = useBackdropDismiss(requestClose);
  return <dialog {...backdrop} ref={ref} className={`${styles.drawer} ${wide ? styles.wideDrawer : ""}`} data-closing={closing} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); requestClose(); }}><div className={styles.drawerContent}><div className={styles.heading}><h2 id={titleId}>{title}</h2><button aria-label="关闭编辑" disabled={busy} onClick={requestClose}>×</button></div>{children}</div></dialog>;
}
export function FoodEditor({ initial, submitLabel = "保存食材", error, busy, save }: { initial: FoodDraft; submitLabel?: string; error: string; busy: boolean; save: (f: FoodDraft, allowMissingImages?: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState<FoodDraft>(() => { const {id,version,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}=initial;return structuredClone({id,version,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}); });
  const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState(""),[textOnly,setTextOnly]=useState(false);
  return <form className={styles.form} aria-busy={busy} onSubmit={e => { e.preventDefault(); void save(draft,textOnly); }}><fieldset disabled={busy||uploading}>
    <label>食材／产品名称<input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className={styles.formColumns}><label>品牌（可选）<input value={draft.brand ?? ""} onChange={e => setDraft({ ...draft, brand: e.target.value || null })} /></label><label>规格／做法（可选）<input placeholder="口味、净重、生／熟…" value={draft.preparation ?? ""} onChange={e => setDraft({ ...draft, preparation: e.target.value || null })} /></label></div>
    <div className={styles.formColumns}><label>营养对应数量<input type="number" min="0.0001" max="1000000" step="0.0001" required value={draft.baseQuantity} onChange={e => setDraft({ ...draft, baseQuantity: e.target.value })} /></label><label>单位<input required maxLength={30} placeholder="包／只／份／g／ml" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label></div>
    <p className={styles.hint}>例如每1包、每1只或每100g对应下方营养。以后选择食材并填写数量，自动换算。</p><NutritionFields value={draft.nutrition} change={nutrition => setDraft({ ...draft, nutrition })} /><SourceFields value={draft} change={fields => setDraft({ ...draft, ...fields })} detailed={submitLabel==="更新预览"} />
    <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(d=>({...d,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(d=>({...d,imageIds}))} busy={busy} onBusy={setUploading} onError={setPhotoError}/>
    {submitLabel!=="更新预览"&&(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<label className={styles.checkbox}><input type="checkbox" checked={textOnly} onChange={e=>setTextOnly(e.target.checked)}/>照片尚未全部保存，先保存文字记录</label>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={uploading||(Boolean(photoError)&&!textOnly)} type="submit" className={styles.save}>{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
