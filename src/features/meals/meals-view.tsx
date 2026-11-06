"use client";
import {numericDraftValue} from "@/components/form-draft";
import recordUI from "@/components/record-ui.module.css";
import {RecordWorkspace,RecordTrendPanel,InlineChartControls,CustomRecordRange} from "@/components/record-trend-panel";
import {confirmAction} from "@/components/confirmation-state";
import {DecimalInput} from "@/components/decimal-input";
import {confirmNumbers} from "@/components/number-change";
import {mealVersions,verifyRecordVersions,acknowledgeRecordChanges} from "@/components/record-change-client";
import { useEffect, useRef, useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import { usePageLoading } from "@/components/page-loading-state";
import { useMobileMode } from "@/components/use-mobile-mode";
import { macroColors,dailyTotals, suggestedMealType, mealOperationStatus, emptyNutrition, formatNutrition, metricLabels, metrics, type FoodDraft, type MealAction,  type MealInput, type MacroMode, type MealOperationView, type MealSnapshot, type MealView, type Metric,  type Result } from "./model";
import { recentRecordDates, pendingRecordDates, rangeContaining } from "@/components/record-dates";
import { DailyRecords,DailyRecordRow } from "@/components/daily-records";
import { RecordHistory } from "@/components/record-history";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import {RecordDetailActions} from "@/components/record-detail-actions";
import { useLocalToday } from "@/components/use-local-today";
import { FoodDetails, FoodTable } from "./presets";
import { PhotoFields } from "./photos";
import { SavedMealList } from "./saved-meal-list";
import { MealDayControl } from "./meal-day-control";
import type { MealDayInput } from "./model";
import {DayNutritionSummary} from "./nutrition-composition";
import { NutritionChart } from "./nutrition-chart";
import { useDraftGuard } from "@/components/draft-guard";
import { Inspector as EditorDialog } from "@/components/inspector";
import { NutritionFields, SourceFields } from "./nutrition-fields";
import { MealEditor } from "./meal-editor";
export { MealEditor } from "./meal-editor";
import { useOperationClock } from "./use-operation-clock";
import styles from "./meals.module.css";
import type { TrendRoute } from "@/components/metric-trend-model";
import { MobileRecordAction } from "@/components/mobile-record-action";

export type SaveMeals = (input: MealInput, allowMissingImages?: boolean) => Promise<Result<{ snapshot: MealSnapshot; message: string }>>;
const unitFor = (metric: Metric) => metric === "caloriesKcal" ? "kcal" : "g";
const dateNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const dateAt = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
export function MealsView({ snapshot, today: initialToday, operations, save, saveDay, purge, initialDate = null,initialEntry=false, initialTrend=null }: { snapshot: MealSnapshot; today: string; operations: MealOperationView[]; save: SaveMeals; saveDay?: (input: MealDayInput) => ReturnType<SaveMeals>; purge: (input: import("./recently-deleted").PermanentDeletion) => ReturnType<SaveMeals>; initialDate?: string|null;initialEntry?:boolean;initialTrend?:TrendRoute|null }) {
  const today=useLocalToday(initialToday), now=useOperationClock();
  const [local,setLocal]=useState<MealSnapshot|null>(null),[base,setBase]=useState(snapshot);
  if(snapshot!==base){setBase(snapshot);setLocal(null);}
  const state=local??snapshot,mobile=useMobileMode(),[tab,setTab]=useState<"meals"|"foods">("meals");
  useDraftGuard(false,false,mealVersions(state));
  const [selectedDate,setSelectedDate]=useState(initialDate??today),[historyOpen,setHistoryOpen]=useState(Boolean(initialDate)&&!initialEntry&&!initialTrend),[rangeChoice,setRange]=useState<string|null>(initialTrend?"custom":null);
  const range=rangeChoice??rangeContaining(initialDate??dailyTotals(state.meals).find(day=>day.date<=today)?.date??today,today,mobile?"7":"30"),[customFrom,setCustomFrom]=useState(initialTrend?.from??""),[customTo,setCustomTo]=useState(initialTrend?.to??today);
  const [customOpen,setCustomOpen]=useState(false),[customDraft,setCustomDraft]=useState({from:today,to:today});
  const [editing,setEditing]=useState<MealAction|null>(null),[foodQuery,setFoodQuery]=useState("");
  useEffect(()=>{if(!initialDate||!initialEntry)return;const timer=setTimeout(()=>setEditing({kind:"save_meal",date:initialDate,mealType:suggestedMealType(new Date().getHours()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]}),0);return()=>clearTimeout(timer);},[initialDate,initialEntry]);
  const [foodCategory,setFoodCategory]=useState("all");
  const [macroMode,setMacroMode]=useState<MacroMode>("grams");
  const [viewingFood,setViewingFood]=useState<FoodDraft|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const busyRef=useRef(false),request=useRef<{data:string;id:string}|null>(null);
  usePageLoading({active:busy,label:"正在保存饮食记录…"});
  useEffect(()=>{const latest=()=>{setEditing(null);setHistoryOpen(false);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const groups=dailyTotals(state.meals), preferred=initialDate??groups.find(day=>day.date<=today&&day.day.status==="complete"&&day.totals.values.caloriesKcal!==null)?.date??groups.find(day=>day.date<=today)?.date??today,end=groups[0]?.date>today?groups[0].date:today;
  const first=groups.at(-1)?.date??today,from=range==="all"?first:range==="custom"?customFrom:dateAt(dateNumber(end)-Number(range)+1),to=range==="custom"?customTo:end;
  const validRange=/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&dateNumber(from)<=dateNumber(to)&&dateNumber(to)-dateNumber(from)<=3660;
  const dates=validRange?Array.from({length:dateNumber(to)-dateNumber(from)+1},(_,i)=>dateAt(dateNumber(from)+i)):[];
  const chart=useChartDateSelection(dates,preferred,dates.findLast(date=>groups.some(g=>g.date===date&&g.day.status==="complete"&&g.totals.values.caloriesKcal!==null))??dates.findLast(date=>groups.some(g=>g.date===date))??today,customOpen),summaryDate=chart.selected,chosen=groups.find(g=>g.date===summaryDate);
  function viewDay(date:string){setSelectedDate(date);setHistoryOpen(true);}
  const dailySummary=(date:string)=>{const group=groups.find(g=>g.date===date);return group?<>{group.meals.length} 餐 · {formatNutrition(group.totals.values.caloriesKcal,"caloriesKcal")} kcal{group.totals.incomplete.caloriesKcal?" · 部分":""}</>:"尚无记录";};
  const recentDates=pendingRecordDates(today,date=>groups.find(g=>g.date===date)?.day.status!=="complete");
  const renderDay=(date:string)=>{const group=groups.find(g=>g.date===date);return <DailyRecordRow key={date} date={date} today={today} value={dailySummary(date)} status={group&&saveDay?<MealDayControl day={group.day} busy={busy} save={performDay}/>:null}><button onClick={()=>addMeal(date)}>{group?"添加一餐":date<today?"补录":"录入"}</button><button onClick={()=>viewDay(date)}>查看</button></DailyRecordRow>;};
  const dayDetails=(date:string)=>{const group=groups.find(g=>g.date===date);return <><DayNutritionSummary totals={group?.totals} partial={group?.day.status!=="complete"}/><SavedMealList meals={group?.meals??[]} renderActions={m=><RecordDetailActions busy={busy} edit={()=>editMeal(m)} remove={()=>void confirmPurge({id:m.id,version:m.version,recordType:"meal",name:m.date+" · "+m.mealType})} recordLabel={m.mealType}/>}/><footer className={styles.dayFooter} data-meal-day-actions><button data-meal-add type="button" className={recordUI.secondary} onClick={()=>addMeal(date)}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3v12M3 9h12"/></svg>添加一餐</button>{group&&saveDay&&<MealDayControl day={group.day} busy={busy} save={performDay}/>}</footer></>;};
  async function perform(action:MealAction, allowMissingImages = false){
    if(busyRef.current)return false;busyRef.current=true;setBusy(true);setError("");setNotice("");
    try{if(action.id&&(action.kind==="save_meal"||action.kind==="save_food")){const key=(action.kind==="save_meal"?"meal:":"food:")+action.id;const latest=await verifyRecordVersions([{key,version:String(action.version)}]);action={...action,version:Number(latest.get(key)!.version)};}}catch(e){setError(e instanceof Error?e.message:"请重试");busyRef.current=false;setBusy(false);return false;}
    const data=JSON.stringify(action);if(request.current?.data!==data)request.current={data,id:crypto.randomUUID()};
    try{const result=await save({operationId:request.current.id,actions:[action]},allowMissingImages);if(!result.ok){setError(result.error);return false;}acknowledgeRecordChanges(action.kind==="save_meal"?[("meal:"+(action.id??result.data.snapshot.meals.find(m=>!state.meals.some(old=>old.id===m.id))?.id)),"mealDay:"+action.date,...(action.id?["mealDay:"+state.meals.find(m=>m.id===action.id)?.date]:[])]:["food:"+(action.id??result.data.snapshot.foods.find(f=>!state.foods.some(old=>old.id===f.id))?.id)],mealVersions(result.data.snapshot));setLocal(result.data.snapshot);setNotice(result.data.message);request.current=null;return true;}
    catch{setError("保存未完成，请重试，当前输入已保留。");return false;}finally{busyRef.current=false;setBusy(false);}
  }
  async function performDay(input: MealDayInput) {
    if (!saveDay || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveDay(input);
      if (!result.ok) { setError(result.error); return false; }
      acknowledgeRecordChanges(["mealDay:"+input.date],mealVersions(result.data.snapshot));setLocal(result.data.snapshot); setNotice(result.data.message); return true;
    } catch { setError("当天记录状态未保存，请重试。"); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function addMeal(date:string){setError("");setEditing({kind:"save_meal",date,mealType:suggestedMealType(new Date().getHours()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]});}
  function editMeal(m:MealView){setError("");setEditing({kind:"save_meal",id:m.id,version:m.version,date:m.date,mealType:m.mealType,notes:m.notes,timezone:m.timezone,occurredAt:m.occurredAt,imageIds:m.imageIds,items:m.items.map(i=>i.foodId||i.foodSnapshot?{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.quantity?i.amountDecision:"unknown_accepted",foodId:i.foodId,foodVersion:i.foodVersion,sourceKind:i.sourceKind,basis:i.basis,reviewExplanation:i.reviewExplanation}:{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.amountDecision,nutritionBasis:i.nutritionBasis,...(i.nutritionBasis==="per_portion"?{perPortionNutrition:i.perPortionNutrition}:{nutrition:i.nutrition}),sourceKind:i.sourceKind,basis:i.basis,evidenceUrl:i.evidenceUrl,reviewExplanation:i.reviewExplanation})});}
  async function confirmPurge(purgeTarget:{id:string;version:number;recordType:"meal"|"food";name:string}){
    if(busyRef.current)return;
    if(!await confirmAction({title:"永久删除这条记录？",message:"永久删除“"+purgeTarget.name+"”？\n"+(purgeTarget.recordType==="food"?"旧餐的营养、用量、历史规格和照片继续保留。":"原始导入和审计记录继续保留。"),confirmLabel:"确认永久删除",danger:true}))return;if(busyRef.current)return;busyRef.current=true;setBusy(true);setError("");
    const {name,...target}=purgeTarget;void name;const data=JSON.stringify({purge:target});if(request.current?.data!==data)request.current={data,id:crypto.randomUUID()};
    try{const result=await purge({...target,operationId:request.current.id});if(!result.ok){setError(result.error);return;}acknowledgeRecordChanges([target.recordType+":"+target.id,...(target.recordType==="meal"?["mealDay:"+state.meals.find(m=>m.id===target.id)?.date]:[])], [...mealVersions(result.data.snapshot),...(target.recordType==="meal"?[{key:"mealDay:"+state.meals.find(m=>m.id===target.id)?.date,version:String((state.meals.find(m=>m.id===target.id)?.day?.version??0)+1)}]:[])]);setLocal(result.data.snapshot);setNotice(result.data.message);setViewingFood(current=>current?.id===target.id?null:current);request.current=null;}catch{setError("删除未完成，请重试。");}finally{busyRef.current=false;setBusy(false);}
  }
  const visibleFoods=state.foods.filter(f=>!f.deletedAt&&(foodCategory==="all"||(f.category??"ingredient")===foodCategory)&&`${f.name} ${f.brand??""} ${f.preparation??""}`.toLowerCase().includes(foodQuery.toLowerCase()));
  return <RecordWorkspace title={tab==="foods"?"食材库":"饮食"} className={styles.workspace} data-active-tab={tab} data-shared-route={initialTrend?true:undefined}>
    {tab==="meals"?<>
      {mobile&&<MobileRecordAction label="记录饮食" date={today} back={!!initialTrend} record={()=>addMeal(today)}/>}
      <div data-chart-selection={chart.regionId} data-selected-date={chart.selected} data-selection-origin={chart.origin} {...chart.regionProps}>
      <RecordTrendPanel
       range={<ChartRanges value={range} change={key=>{if(key==="custom"){setCustomDraft({from:customFrom||from,to:customTo});setCustomOpen(true);}else{setRange(key);setCustomOpen(false);}}}/>}
       custom={customOpen&&<CustomRecordRange label="饮食" value={customDraft} change={setCustomDraft} apply={()=>{setCustomFrom(customDraft.from);setCustomTo(customDraft.to);setRange("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
       date={summaryDate} view={()=>{const target=summaryDate;viewDay(target);chart.release();}} readoutLabel="选中日营养"
       metrics={metrics.map(metric=>({label:metricLabels[metric],value:formatNutrition(chosen?.totals.values[metric]??null,metric),unit:unitFor(metric),inlineUnit:metric!=="caloriesKcal",tone:metric==="caloriesKcal"?"blue":undefined,note:chosen?.totals.incomplete[metric]?"已知部分":undefined,reserveNote:groups.some(group=>group.date>=from&&group.date<=to&&group.totals.incomplete[metric])}))}
       metricVariants={groups.filter(group=>group.date>=from&&group.date<=to).map(group=>metrics.map(metric=>formatNutrition(group.totals.values[metric],metric)))}
       title="每日摄入" unit="kcal"
       options={<InlineChartControls><div role="group" aria-label="营养占比口径">{([["grams","克数占比"],["energy","能量占比"]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={macroMode===value} onClick={()=>setMacroMode(value)}>{label}</button>)}</div></InlineChartControls>}
       legend={<>{(["proteinG","carbsG","fatG"] as const).map(metric=><span key={metric}><i style={{background:macroColors[metric]}}/>{metricLabels[metric]}</span>)}{!mobile&&groups.some(group=>group.day.status!=="complete")&&<span>未记全／待确认</span>}</>}
      >{validRange?<NutritionChart dates={dates} groups={groups} mode={macroMode} selection={chart}/>:<p className={styles.hint}>请选择有效日期区间，最长10年。</p>}</RecordTrendPanel>
      </div>
      {error&&!editing&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.hint}>{notice}</p>}
      {operations.filter(op=>mealOperationStatus(op,now)==="pending"&&op.origin!=="manual").map(op=><LoadingLink key={op.id} className={styles.reviewLink} href={op.confirmationPath}>AI 饮食预览 · {op.rows.length} 项待确认 <span>查看 →</span></LoadingLink>)}
      <DailyRecords actions={<button type="button" onClick={()=>setTab("foods")}>食材库</button>} history={<RecordHistory today={today} dates={[...new Set([...recentRecordDates(today),...groups.map(g=>g.date)])].filter(date=>!recentDates.includes(date)).sort().reverse()} renderRow={renderDay} view={viewDay}/>}>{recentDates.map(renderDay)}</DailyRecords>
    </>:<>
      <div className={styles.libraryNavigation}><button type="button" className={recordUI.secondary} onClick={()=>setTab("meals")}>← 饮食记录</button><h2>食材库</h2></div>
      <div className={styles.categoryTabs}>{[["all","全部"],["meal","整餐"],["ingredient","食材"]].map(([key,label])=><button key={key} aria-pressed={foodCategory===key} onClick={()=>setFoodCategory(key)}>{label}</button>)}</div><div className={styles.toolbar}><input aria-label="搜索食材" placeholder="搜索名称、品牌或做法" value={foodQuery} onChange={e=>setFoodQuery(e.target.value)}/><button className={styles.primary} onClick={()=>{setError("");setEditing({kind:"save_food",name:"",brand:null,preparation:null,baseQuantity:"1",unit:"份",nutrition:emptyNutrition(),sourceKind:"reference"});}}>添加食材 ＋</button></div>
      {visibleFoods.length ? <FoodTable foods={visibleFoods} details={setViewingFood} actions={f=><><button className={recordUI.secondary} onClick={()=>{setError("");setEditing({kind:"save_food",...f});}}>编辑</button><button className={recordUI.secondary} disabled={busy} onClick={()=>void confirmPurge({id:f.id,version:f.version,recordType:"food",name:f.name})}>删除</button></>}/> : <p className={styles.hint}>还没有匹配的条目，可以添加食材或整餐。</p>}
    </>}
    {historyOpen&&<EditorDialog title={selectedDate+" · 饮食记录"} titleParts={[selectedDate,"饮食记录"]} stableScroll close={()=>setHistoryOpen(false)} busy={busy}>{error&&<p role="alert" className={styles.error}>{error}</p>}{dayDetails(selectedDate)}</EditorDialog>}

    {viewingFood&&<EditorDialog title="食材详情" close={()=>setViewingFood(null)} busy={false}><FoodDetails food={viewingFood}/><div className={styles.actions}><button className={recordUI.secondary} onClick={()=>{setEditing({kind:"save_food",...viewingFood});setViewingFood(null);}}>编辑</button>{viewingFood.id&&<button className={recordUI.secondary} disabled={busy} onClick={()=>{void confirmPurge({id:viewingFood.id!,version:viewingFood.version!,recordType:"food",name:viewingFood.name});}}>删除</button>}</div></EditorDialog>}
    {editing&&<EditorDialog wide={editing.kind==="save_meal"} title={editing.kind==="save_food"?"食材规格":editing.id?"编辑餐次":"记录一餐"} close={()=>{if(!busy){setEditing(null);setError("");}}} busy={busy}>{editing.kind==="save_food"?<FoodEditor initial={editing} error={error} busy={busy} save={async (f,allowMissingImages)=>{if(await perform({kind:"save_food",...f},allowMissingImages))setEditing(null);}}/>:editing.kind==="save_meal"?<MealEditor recentMeals={state.meals} historicalItems={state.meals.find(m=>m.id===editing.id)?.items??[]} historicalFoods={state.meals.find(m=>m.id===editing.id)?.items.flatMap(i=>i.foodSnapshot?[i.foodSnapshot]:[])??[]} initial={editing} foods={state.foods} error={error} busy={busy} save={async (m,allowMissingImages)=>{if(await perform({kind:"save_meal",...m},allowMissingImages))setEditing(null);}}/>:null}</EditorDialog>}
  </RecordWorkspace>;
}
export { Inspector as EditorDialog } from "@/components/inspector";
export function FoodEditor({ initial, submitLabel = "保存食材", error, busy, save }: { initial: FoodDraft; submitLabel?: string; error: string; busy: boolean; save: (f: FoodDraft, allowMissingImages?: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState<FoodDraft>(() => { const {id,version,category,name,brand,preparation,baseQuantity,unit,servingQuantity,servingUnit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}=initial;return structuredClone({id,version,category,name,brand,preparation,baseQuantity,unit,servingQuantity,servingUnit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}); });
  const numberAcknowledgements=useRef(new Set<string>());
  const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState("");
  const signature=(value:FoodDraft)=>JSON.stringify({...value,name:value.name.trim(),baseQuantity:numericDraftValue(value.baseQuantity),nutrition:Object.fromEntries(Object.entries(value.nutrition).map(([k,v])=>[k,numericDraftValue(v)]))});
  const [initialSignature] = useState(() => signature(draft));
  useDraftGuard(signature(draft) !== initialSignature, uploading);
  return <form data-entry-form="food" className={styles.form} aria-busy={busy} onSubmit={async e => { e.preventDefault(); if(!await confirmNumbers(metrics.map(metric=>({label:metricLabels[metric],unit:metric==="caloriesKcal"?"kcal":"g",value:draft.nutrition[metric],previous:initial.nutrition[metric]})),numberAcknowledgements.current))return;void save(draft,true); }}><fieldset disabled={busy||uploading}>
    <label>分类<select aria-label="食材分类" value={draft.category??"ingredient"} onChange={e=>setDraft({...draft,category:e.target.value as "meal"|"ingredient"})}><option value="ingredient">食材</option><option value="meal">整餐</option></select></label>
    <label>食材／产品名称<input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className={styles.formColumns}><label><span className={styles.fieldCaption}>品牌<small>选填</small></span><input aria-label="品牌（可选）" value={draft.brand ?? ""} onChange={e => setDraft({ ...draft, brand: e.target.value || null })} /></label><label><span className={styles.fieldCaption}>规格／做法<small>选填</small></span><input aria-label="规格／做法（可选）" placeholder="口味、净重、生／熟…" value={draft.preparation ?? ""} onChange={e => setDraft({ ...draft, preparation: e.target.value || null })} /></label></div>
    <div className={styles.formColumns}><label>营养对应数量<DecimalInput min={0.01} max={1000000} required value={draft.baseQuantity} onValue={value=>setDraft({...draft,baseQuantity:value})}/></label><label>单位<input required maxLength={30} placeholder="包／只／份／g／ml" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label></div>
    <p className={styles.foodBasis}>{draft.baseQuantity&&draft.unit?<span>每{Number(draft.baseQuantity)}{draft.unit}营养</span>:<span>填写每份营养</span>}{draft.servingQuantity&&draft.servingUnit&&<span>1{draft.servingUnit}＝{Number(draft.servingQuantity)}{draft.unit}</span>}</p><NutritionFields value={draft.nutrition} change={nutrition => setDraft({ ...draft, nutrition })} /><SourceFields value={draft} change={fields => setDraft({ ...draft, ...fields })} detailed={submitLabel==="应用修改"} />
    <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(d=>({...d,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(d=>({...d,imageIds}))} busy={busy} onBusy={setUploading} onError={setPhotoError}/>
    {(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<p className={styles.hint}>照片未齐，可先保存文字，之后补传。</p>}{photoError&&<p className={styles.hint}>{photoError} 可先保存文字。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={uploading} type="submit" className={styles.save}>{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
