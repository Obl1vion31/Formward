"use client";
import {NutritionLegend} from '@/components/chart-legend';
import {numericDraftValue} from "@/components/form-draft";
import recordUI from "@/components/record-ui.module.css";
import {RecordWorkspace,RecordTrendPanel,InlineChartControls,CustomRecordRange} from "@/components/record-trend-panel";
import {confirmAction} from "@/components/confirmation-state";
import {DecimalInput} from "@/components/decimal-input";
import {mealVersions,verifyRecordVersions,acknowledgeRecordChanges} from "@/components/record-change-client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createWorkspaceExchange } from "@/components/workspace-motion";
import { initialHistoryDisplay, type HistoryDisplay } from "@/components/record-history";
import { useAssistant } from "@/features/assistant/context";
import { LoadingLink } from "@/components/loading-link";

import { useInitialMobileMode } from "@/components/use-mobile-mode";
import { dailyTotals, suggestedMealType, mealOperationStatus, emptyNutrition, formatNutrition, type FoodDraft, type MealAction,  type MealInput, type MacroMode, type MealOperationView, type MealSnapshot, type MealView, type Result } from "./model";
import { recentRecordDates, rangeContaining } from "@/components/record-dates";
import { DailyRecords, DailyRecordRow, RecordRowAction } from "@/components/daily-records";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { useNestedChartRange } from "@/components/use-nested-chart-range";
import {RecordDetailActions} from "@/components/record-detail-actions";
import { useLocalToday } from "@/components/use-local-today";
import { FoodTable } from "./presets";
import { MealPageActions, NutritionSummaryCard } from "./nutrition-summary-card";
import { TaskGuide } from "@/components/task-guide";
import { isMealLibrary } from "./library-location";
import { FoodLibraryControls } from "./library-controls";
import { FoodLibraryTabs, ReferenceBrowser, type FoodLibraryScope } from "./reference-browser";
import referenceStyles from "./reference-library.module.css";
import { PhotoFields } from "./photos";
import { SavedMealList } from "./saved-meal-list";
import { MealDayControl, MealDayStatus } from "./meal-day-control";
import type { MealDayInput, MealDraft } from "./model";
import {DayNutritionSummary} from "./nutrition-composition";
import { NutritionChart } from "./nutrition-chart";
import { useDraftGuard, confirmDraftDiscard } from "@/components/draft-guard";
import type { RecordIntent } from "@/components/record-intent";
import {useRepeatedRecordTask} from '@/components/record-intent-client';
import { Inspector as EditorDialog } from "@/components/inspector";
import { NutritionFields, SourceFields } from "./nutrition-fields";
import { MealEditor } from "./meal-editor";
import { foodGroups, foodGroupLabels, type FoodGroup } from "./model";
export { MealEditor } from "./meal-editor";
import { useOperationClock } from "./use-operation-clock";
import styles from "./meals.module.css";
import type { TrendRoute } from "@/components/metric-trend-model";


export type SaveMeals = (input: MealInput, allowMissingImages?: boolean) => Promise<Result<{ snapshot: MealSnapshot; message: string }>>;
const dateNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const dateAt = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
type MealsDisplay = {
  accountId: string;
  scroll: number;
  date: string;
  range: string;
  customFrom: string;
  customTo: string;
  nutrition: boolean;
  history: HistoryDisplay;
};

export function MealsView({ accountId, snapshot, today: initialToday, operations, save, saveDay, purge, initialDate: requestedDate = null,initialEntry: requestedEntry=false,manual, initialTrend=null,initialIntent='view' }: { accountId: string; snapshot: MealSnapshot; today: string; operations: MealOperationView[]; save: SaveMeals; saveDay?: (input: MealDayInput) => ReturnType<SaveMeals>; purge: (input: import("./recently-deleted").PermanentDeletion) => ReturnType<SaveMeals>; initialDate?: string|null;initialEntry?:boolean;manual?:{id:string;draft:MealDraft};initialTrend?:TrendRoute|null;initialIntent?:RecordIntent }) {
  const today=useLocalToday(initialToday), now=useOperationClock();
  const [local,setLocal]=useState<MealSnapshot|null>(null),[base,setBase]=useState(snapshot);
  if(snapshot!==base){setBase(snapshot);setLocal(null);}
  const state = local ?? snapshot, mobile = useInitialMobileMode();
  const params = useSearchParams(), { source,openMealTask } = useAssistant();
  const query = source?.path === "/dashboard/meals" ? new URLSearchParams(source.query) : params;
  const foods = isMealLibrary(query);
  const initialEntry = requestedEntry && query.get("entry") === "1";
  const initialDate = requestedEntry && !initialEntry ? null : requestedDate;
  const libraryEntry = useRef<HTMLButtonElement>(null);
  const libraryBack = useRef<HTMLButtonElement>(null);
  const mealPane = useRef<HTMLDivElement>(null);
  const libraryPane = useRef<HTMLDivElement>(null);
  const recordsScroll = useRef(0);
  const libraryScroll = useRef(0);
  const libraryReturn = useRef<MealsDisplay | null>(null);
  const leaving = useRef(false);
  const exchange = useMemo(() => createWorkspaceExchange(), []);
  const [scene, setScene] = useState({ foods, moving: false });
  if (scene.foods !== foods) setScene({ foods, moving: true });
  const [nutrition, setNutrition] = useState(false);
  const [history, setHistory] = useState(initialHistoryDisplay);
  const [restoreDate, setRestoreDate] = useState("");
  const [selectedDate,setSelectedDate]=useState(initialDate??today),[historyOpen,setHistoryOpen]=useState(Boolean(initialDate)&&!initialEntry&&!initialTrend&&!foods),[rangeChoice,setRange]=useState<string|null>(initialTrend?"custom":null);
  const [dayIntent,setDayIntent]=useState<RecordIntent>(initialIntent==='edit'?'edit':'view');
  const range=rangeChoice??rangeContaining(initialDate??dailyTotals(state.meals).find(day=>day.date<=today)?.date??today,today,mobile?"7":"30"),[customFrom,setCustomFrom]=useState(initialTrend?.from??""),[customTo,setCustomTo]=useState(initialTrend?.to??today);
  const [customOpen,setCustomOpen]=useState(false),[customDraft,setCustomDraft]=useState({from:today,to:today});
  const [editing,setEditing]=useState<MealAction|null>(null),[foodQuery,setFoodQuery]=useState("");
  useEffect(()=>{if(!initialDate||!initialEntry)return;const timer=setTimeout(()=>setEditing(manual?{...manual.draft,kind:"save_meal"}:{kind:"save_meal",date:initialDate,mealType:suggestedMealType(new Date().getHours()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]}),0);return()=>clearTimeout(timer);},[initialDate,initialEntry,manual]);
  const [foodCategory,setFoodCategory]=useState("all");
  const [foodScope, setFoodScope] = useState<FoodLibraryScope>("reference");
  const [macroMode,setMacroMode]=useState<MacroMode>("grams");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [dayErrors,setDayErrors]=useState<Record<string,string>>({});
  const [dayChartFallback,setDayChartFallback]=useState<{from:string;to:string;date:string}|null>(null);
  const savedClose=useRef<()=>Promise<void>>(()=>Promise.resolve());
  const busyRef=useRef(false),request=useRef<{data:string;id:string}|null>(null);

  useEffect(()=>{const latest=()=>{setEditing(null);setHistoryOpen(false);setDayErrors({});setDayChartFallback(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const groups=dailyTotals(state.meals), preferred=initialDate??today,end=groups[0]?.date>today?groups[0].date:today;
  const first=groups.at(-1)?.date??today,from=range==="all"?first:range==="custom"?customFrom:dateAt(dateNumber(end)-Number(range)+1),to=range==="custom"?customTo:end;
  const validRange=/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&dateNumber(from)<=dateNumber(to)&&dateNumber(to)-dateNumber(from)<=3660;
  const dates=validRange?Array.from({length:dateNumber(to)-dateNumber(from)+1},(_,i)=>dateAt(dateNumber(from)+i)):[];
  const defaultChartDate=dates.includes(today)?today:dates.findLast(date=>groups.some(g=>g.date===date&&g.day.status==="complete"&&g.totals.values.caloriesKcal!==null))??dates.findLast(date=>groups.some(g=>g.date===date))??today;
  const chart=useChartDateSelection(dates,preferred,dayChartFallback?.from===from&&dayChartFallback.to===to?dayChartFallback.date:initialDate&&dates.includes(initialDate)?initialDate:defaultChartDate,customOpen,"",true),summaryDate=chart.selected,chosen=groups.find(g=>g.date===summaryDate);
  const {bindPlot, prepare: prepareRange}=useNestedChartRange({mode:range,from,to,series:macroMode});
  useLayoutEffect(() => {
    // Native history entries store presentation only, scoped to the same signed-in account.
    const display = window.history.state?.formwardMealsDisplay as MealsDisplay | undefined;
    if (display?.accountId !== accountId) return;
    recordsScroll.current = display.scroll;
    const frame = requestAnimationFrame(() => {
      setNutrition(display.nutrition);
      setHistory(display.history);
      setRange(display.range);
      setCustomFrom(display.customFrom);
      setCustomTo(display.customTo);
      setRestoreDate(display.date);
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId]);
  useLayoutEffect(() => {
    if (!foods || location.pathname !== "/dashboard/meals" || !isMealLibrary(new URLSearchParams(location.search))) {
      libraryReturn.current = null;
      return;
    }
    const entry = window.history.state;
    const display = entry?.formwardMealsDisplay as MealsDisplay | undefined;
    if (entry?.formwardMealLibrary === accountId && display?.accountId === accountId) {
      libraryReturn.current = display;
      return;
    }
    const origin = libraryReturn.current;
    if (origin?.accountId !== accountId) return;
    // 保存后的 Next.js 路由提交可能重建当前历史项。补回本次食材库的来源。
    window.history.replaceState({ ...entry, formwardMealLibrary: accountId, formwardMealsDisplay: origin }, "");
  }, [accountId, foods, state]);
  const restorableDate = dates.includes(restoreDate) ? restoreDate : "";
  useLayoutEffect(() => {
    if (!restorableDate) return;
    const frame = requestAnimationFrame(() => {
      chart.pin(restorableDate);
      setRestoreDate("");
    });
    return () => cancelAnimationFrame(frame);
  }, [restorableDate, chart]);
  useLayoutEffect(() => exchange.stop, [exchange]);
  useLayoutEffect(() => {
    if (!scene.moving) { exchange.stop(); return; }
    const enter = foods ? libraryPane.current : mealPane.current;
    const exit = foods ? mealPane.current : libraryPane.current;
    if (!enter || !exit) return;
    if (!foods) leaving.current = false;
    window.scrollTo({ top: foods ? libraryScroll.current : recordsScroll.current, behavior: "instant" });
    (foods ? libraryBack : libraryEntry).current?.focus({ preventScroll: true });
    exchange.play(enter, exit, foods ? 1 : -1, () => {
      setScene(active => active === scene ? { foods, moving: false } : active);
    });
  }, [foods, scene, exchange]);

  function openFoodLibrary() {
    if (document.querySelector(".glass-menu[open]")) return;
    const url = new URL(location.href);
    if (isMealLibrary(url.searchParams)) return;
    recordsScroll.current = window.scrollY;
    libraryScroll.current = 0;
    const display: MealsDisplay = {
      accountId, scroll: recordsScroll.current, date: summaryDate, range,
      customFrom, customTo, nutrition, history,
    };
    libraryReturn.current = display;
    window.history.replaceState({ ...window.history.state, formwardMealsDisplay: display }, "");
    url.searchParams.set("section", "foods");
    window.history.pushState({ formwardMealLibrary: accountId, formwardMealsDisplay: display }, "", url);
  }

  function closeFoodLibrary() {
    if (leaving.current) return;
    leaving.current = true;
    libraryScroll.current = window.scrollY;
    if (window.history.state?.formwardMealLibrary === accountId) {
      window.history.back();
    } else {
      const url = new URL(location.href);
      url.searchParams.delete("section");
      window.history.replaceState(null, "", url);
    }
  }

  function viewDay(date:string){setDayIntent('view');setSelectedDate(date);setHistoryOpen(true);}
  function editDay(date:string){setDayIntent('edit');setSelectedDate(date);setHistoryOpen(true);setError('');}
  const dailySummary=(date:string)=>{const group=groups.find(g=>g.date===date);return group?<>{group.meals.length} 餐 · {formatNutrition(group.totals.values.caloriesKcal,"caloriesKcal")} 千卡{group.totals.incomplete.caloriesKcal?" · 部分":""}</>:"尚无记录";};
  // 今日记录与图表选日互不替换；历史在原位展开，保留阅读位置。
  const recentDates=[today];
  const renderDay=(date:string)=>{const group=groups.find(g=>g.date===date);return <DailyRecordRow key={date} date={date} today={today} value={dailySummary(date)} status={group?(saveDay?<MealDayControl day={group.day} busy={busy} error={dayErrors[date]} save={performDay}/>:<MealDayStatus day={group.day}/>):null}><RecordRowAction intent="edit" onClick={()=>group?editDay(date):addMeal(date)}>{group?"编辑":date<today?"补录":"录入"}</RecordRowAction><RecordRowAction intent="view" onClick={()=>viewDay(date)}>查看</RecordRowAction></DailyRecordRow>;};
  const dayDetails=(date:string)=>{
    const group=groups.find(g=>g.date===date), editable=dayIntent==='edit';
    return <>
      <DayNutritionSummary totals={group?.totals} partial={group?.day.status!=="complete"}/>
      {group&&!editable&&<MealDayStatus day={group.day}/>}
      <SavedMealList meals={group?.meals??[]} renderActions={editable?m=><RecordDetailActions busy={busy} edit={()=>editMeal(m)} remove={()=>void confirmPurge({id:m.id,version:m.version,recordType:"meal",name:m.date+" · "+m.mealType})} recordLabel={m.mealType}/>:undefined}/>
      {editable&&<footer className={styles.dayFooter} data-meal-day-actions>
        <button data-meal-add type="button" className={recordUI.editAction} onClick={()=>addMeal(date)}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 3v12M3 9h12"/></svg>{group?"再记一餐":"添加一餐"}</button>
        {group&&saveDay&&<MealDayControl day={group.day} busy={busy} error={dayErrors[date]} save={performDay}/>}
      </footer>}
    </>;
  };
  async function perform(action:MealAction, allowMissingImages = false){
    if(busyRef.current)return false;busyRef.current=true;setBusy(true);setError("");setNotice("");
    try{if(action.id&&(action.kind==="save_meal"||action.kind==="save_food")){const key=(action.kind==="save_meal"?"meal:":"food:")+action.id;const latest=await verifyRecordVersions([{key,version:String(action.version)}]);action={...action,version:Number(latest.get(key)!.version)};}}catch(e){setError(e instanceof Error?e.message:"请重试");busyRef.current=false;setBusy(false);return false;}
    const data=JSON.stringify(action);if(request.current?.data!==data)request.current={data,id:action.kind==="save_meal"&&initialEntry&&manual?manual.id:crypto.randomUUID()};
    try{const result=await save({operationId:request.current.id,actions:[action]},allowMissingImages);if(!result.ok){setError(result.error);return false;}acknowledgeRecordChanges(action.kind==="save_meal"?[("meal:"+(action.id??result.data.snapshot.meals.find(m=>!state.meals.some(old=>old.id===m.id))?.id)),"mealDay:"+action.date,...(action.id?["mealDay:"+state.meals.find(m=>m.id===action.id)?.date]:[])]:["food:"+(action.id??result.data.snapshot.foods.find(f=>!state.foods.some(old=>old.id===f.id))?.id)],mealVersions(result.data.snapshot));setLocal(result.data.snapshot);setNotice(result.data.message);request.current=null;return true;}
    catch{setError("保存未完成，请重试，当前输入已保留。");return false;}finally{busyRef.current=false;setBusy(false);}
  }
  async function performDay(input: MealDayInput) {
    if (!saveDay || busyRef.current) return false;
    busyRef.current = true; setBusy(true);
    setDayChartFallback({from,to,date:chart.selected});
    setDayErrors(current=>({...current,[input.date]:""}));
    try {
      const result = await saveDay(input);
      if (!result.ok) { setDayErrors(current=>({...current,[input.date]:result.error})); return false; }
      acknowledgeRecordChanges(["mealDay:"+input.date],mealVersions(result.data.snapshot));setLocal(result.data.snapshot);return true;
    } catch { setDayErrors(current=>({...current,[input.date]:"状态未保存，请再次点击重试。"})); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  function addMeal(date:string){setError("");setEditing({kind:"save_meal",date,mealType:suggestedMealType(new Date().getHours()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,items:[]});}
  useRepeatedRecordTask('/dashboard/meals',task=>{
    if (foods) closeFoodLibrary();
    setEditing(null);
    if(task.intent==='create'){setHistoryOpen(false);addMeal(task.date);}
    else if(task.intent==='edit')editDay(task.date);
    else viewDay(task.date);
  });
  function editMeal(m:MealView){setError("");setEditing({kind:"save_meal",id:m.id,version:m.version,date:m.date,mealType:m.mealType,notes:m.notes,timezone:m.timezone,occurredAt:m.occurredAt,imageIds:m.imageIds,items:m.items.map(i=>i.foodId||i.foodSnapshot||i.referenceSnapshot?{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.quantity?i.amountDecision:"unknown_accepted",foodId:i.foodId,foodVersion:i.foodVersion,referenceFood:i.referenceFood,sourceKind:i.sourceKind,basis:i.basis,reviewExplanation:i.reviewExplanation}:{originalItemId:i.id,kind:i.kind,name:i.name,quantity:i.quantity,unit:i.unit,amountDecision:i.amountDecision,nutritionBasis:i.nutritionBasis,...(i.nutritionBasis==="per_portion"?{perPortionNutrition:i.perPortionNutrition}:{nutrition:i.nutrition}),sourceKind:i.sourceKind,basis:i.basis,evidenceUrl:i.evidenceUrl,reviewExplanation:i.reviewExplanation})});}
  async function confirmPurge(purgeTarget:{id:string;version:number;recordType:"meal"|"food";name:string}){
    if(busyRef.current)return false;
    if(!await confirmAction({title:"永久删除这条记录？",message:"永久删除“"+purgeTarget.name+"”？\n"+(purgeTarget.recordType==="food"?"旧餐的营养、用量、历史规格和照片继续保留。":"原始导入和审计记录继续保留。"),confirmLabel:"确认永久删除",danger:true}))return false;if(busyRef.current)return false;busyRef.current=true;setBusy(true);setError("");
    const {name,...target}=purgeTarget;void name;const data=JSON.stringify({purge:target});if(request.current?.data!==data)request.current={data,id:crypto.randomUUID()};
    try{const result=await purge({...target,operationId:request.current.id});if(!result.ok){setError(result.error);return false;}acknowledgeRecordChanges([target.recordType+":"+target.id,...(target.recordType==="meal"?["mealDay:"+state.meals.find(m=>m.id===target.id)?.date]:[])], [...mealVersions(result.data.snapshot),...(target.recordType==="meal"?[{key:"mealDay:"+state.meals.find(m=>m.id===target.id)?.date,version:String((state.meals.find(m=>m.id===target.id)?.day?.version??0)+1)}]:[])]);setLocal(result.data.snapshot);setNotice(result.data.message);request.current=null;return true;}catch{setError("删除未完成，请重试。");return false;}finally{busyRef.current=false;setBusy(false);}
  }
  const visibleFoods=state.foods.filter(f=>!f.deletedAt&&(foodCategory==="all"||(f.category??"ingredient")===foodCategory)&&`${f.name} ${f.brand??""} ${f.preparation??""}`.toLowerCase().includes(foodQuery.toLowerCase()));
  return <RecordWorkspace title={foods?"食材库":"饮食"} className={styles.workspace} data-active-tab={foods?"foods":"meals"} data-shared-route={initialTrend?true:undefined}>
    <div className={styles.mealScenes} data-meal-moving={scene.moving||undefined}>
    <div ref={mealPane} hidden={foods && !scene.moving} inert={foods} aria-hidden={foods || undefined}
      data-meal-leaving={foods && scene.moving || undefined}>

      <div data-record-trend data-chart-selection={chart.regionId} data-selected-date={chart.selected} data-selection-origin={chart.origin} {...chart.regionProps}>
      <RecordTrendPanel presentation="nutrition" readings={<NutritionSummaryCard date={summaryDate} totals={chosen?.totals} mealCount={chosen?.meals.length}
        estimated={chosen?.meals.some(meal=>meal.items.some(item=>item.nutrition.caloriesKcal!==null&&(item.sourceKind==="estimated"||item.amountDecision==="estimate_accepted")))}
        expanded={nutrition} onExpandedChange={setNutrition}
        actions={<MealPageActions record={()=>addMeal(summaryDate)} openLibrary={openFoodLibrary} libraryRef={libraryEntry} historical={summaryDate!==today}/>}/>}
       guidance={<TaskGuide task="meal-page-entry" text={summaryDate===today?"点「记一餐」，选食材、手填或拍照。":"点「补记这天」，记录会归到当前选中的日期。"} auto={summaryDate===today&&!editing&&!historyOpen&&!foods}/>}
       range={<ChartRanges value={range} change={key=>{if(key==="custom"){setCustomDraft({from:customFrom||from,to:customTo});setCustomOpen(true);}else{prepareRange(key);setRange(key);setCustomOpen(false);}}}/>}
       custom={customOpen&&<CustomRecordRange label="饮食" value={customDraft} change={setCustomDraft} apply={()=>{setCustomFrom(customDraft.from);setCustomTo(customDraft.to);setRange("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
       date={summaryDate}
       view={()=>{const target=summaryDate;viewDay(target);chart.releasePreview();}}
       title="每日摄入" unit="千卡"
       options={<InlineChartControls><div role="group" aria-label="营养占比口径">{([["grams","克数占比"],["energy","能量占比"]] as const).map(([value,label])=><button type="button" key={value} aria-pressed={macroMode===value} onClick={()=>setMacroMode(value)}>{label}</button>)}</div></InlineChartControls>}
       legend={<><NutritionLegend/>{groups.some(group=>group.day.status!=="complete")&&<span className={styles.desktopOnlyLegend}>未记全／待确认</span>}</>}
      >{validRange?<div data-nested-chart ref={bindPlot}><NutritionChart dates={dates} groups={groups} mode={macroMode} selection={chart} compact={dates.length<=31} linked={!!initialTrend&&from===initialTrend.from&&to===initialTrend.to}/></div>:<p className={styles.hint}>请选择有效日期区间，最长10年。</p>}</RecordTrendPanel>
      </div>
      {error&&!editing&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.hint}>{notice}</p>}
      <DailyRecords history={{today,dates:[...new Set([...recentRecordDates(today),...groups.map(g=>g.date)])].filter(date=>!recentDates.includes(date)).sort().reverse(),renderRow:renderDay,view:viewDay,display:{value:history,change:setHistory}}}>{recentDates.map(renderDay)}</DailyRecords>
      {operations.filter(op=>mealOperationStatus(op,now)==="pending"&&op.origin!=="manual").map(op=><LoadingLink key={op.id} className={styles.reviewLink} returnScope="workspace" href={op.confirmationPath}>AI 饮食预览 · {op.rows.length} 项待确认 <span>查看 →</span></LoadingLink>)}
    </div>
    <div className={styles.library} ref={libraryPane} hidden={!foods && !scene.moving}
      inert={!foods} aria-hidden={!foods || undefined} data-meal-leaving={!foods && scene.moving || undefined}>
      <div className={referenceStyles.scopeBar}>
        <button ref={libraryBack} type="button" className={recordUI.textAction} onClick={closeFoodLibrary}>← 饮食</button>
        <FoodLibraryTabs scope={foodScope} change={setFoodScope}/>
      </div>
      <div hidden={foodScope !== "reference"}>
        <ReferenceBrowser key={accountId} query={foodQuery} search={setFoodQuery} enabled={foods && foodScope === "reference"}/>
      </div>
      {foodScope === "personal" && <>
        <FoodLibraryControls category={foodCategory} select={setFoodCategory} query={foodQuery} search={setFoodQuery}
          add={() => { setError(""); setEditing({kind:"save_food", name:"", brand:null, preparation:null, baseQuantity:"1", unit:"份", nutrition:emptyNutrition(), sourceKind:"reference"}); }}/>
        {visibleFoods.length ? <FoodTable foods={visibleFoods} edit={food => { setError(""); setEditing({kind:"save_food",...food}); }}/> :
          <p className={styles.hint}>还没有匹配的个人食材，可以添加食材或整餐。</p>}
      </>}
    </div>
    </div>
    {(historyOpen||editing)&&<EditorDialog closeLabel={editing||historyOpen&&dayIntent==='edit'?'关闭编辑':'关闭详情'} routeEntry={!!(initialEntry&&editing?.kind==='save_meal'&&editing.date===initialDate)} wide={editing?.kind==='save_meal'} backAction={editing?.kind==='save_meal'&&historyOpen&&dayIntent==='edit'?{label:"返回当天编辑",run:()=>{void confirmDraftDiscard().then(ok=>{if(ok)setEditing(null);});}}:undefined} title={editing?editing.kind==='save_food'?(editing.id?'编辑食材':'添加食材'):editing.id?'编辑餐次':'记录一餐':selectedDate+(dayIntent==='edit'?' · 编辑饮食':' · 饮食记录')} titleParts={!editing?[selectedDate,dayIntent==='edit'?'编辑饮食':'饮食记录']:undefined} stableScroll={!editing&&dayIntent==='view'} busy={busy} onSavedCloseReady={close=>{savedClose.current=close;}} close={()=>{setHistoryOpen(false);setEditing(null);setError('');}}>
      <div data-record-intent={editing?editing.id?'edit':'create':dayIntent}>
        {editing?.kind==='save_food'?<>
          <FoodEditor initial={editing} error={error} busy={busy} save={async(f,allowMissingImages)=>{if(await perform({kind:'save_food',...f},allowMissingImages))void savedClose.current();}}/>
          {editing.id&&<details className={recordUI.editMaintenance}><summary>更多操作</summary><button type="button" disabled={busy} onClick={async()=>{if(await confirmDraftDiscard()&&await confirmPurge({id:editing.id!,version:editing.version!,recordType:'food',name:editing.name}))void savedClose.current();}}>永久删除食材</button></details>}
        </>:editing?.kind==='save_meal'?<>
          <MealEditor allowAi={!initialEntry||!manual} onPhotoSent={async id=>{await savedClose.current();openMealTask(id);}} onAiSaved={snapshot=>{acknowledgeRecordChanges(snapshot.meals.filter(meal=>meal.date===editing.date).flatMap(meal=>["meal:"+meal.id,"mealDay:"+meal.date]),mealVersions(snapshot));setLocal(snapshot);setNotice("餐次已保存");if(historyOpen&&dayIntent==='edit')setEditing(null);else void savedClose.current();}} recentMeals={state.meals} historicalItems={state.meals.find(m=>m.id===editing.id)?.items??[]} historicalFoods={state.meals.find(m=>m.id===editing.id)?.items.flatMap(i=>i.foodSnapshot?[i.foodSnapshot]:[])??[]} initial={editing} foods={state.foods} error={error} busy={busy} save={async(m,allowMissingImages)=>{if(await perform({kind:'save_meal',...m},allowMissingImages)){if(historyOpen&&dayIntent==='edit')setEditing(null);else void savedClose.current();}}}/>
        </>:<>{error&&<p role="alert" className={styles.error}>{error}</p>}{dayDetails(selectedDate)}</>}
      </div>
    </EditorDialog>}
  </RecordWorkspace>;
}
export { Inspector as EditorDialog } from "@/components/inspector";
export function FoodEditor({ initial, submitLabel = "保存食材", error, busy, save }: { initial: FoodDraft; submitLabel?: string; error: string; busy: boolean; save: (f: FoodDraft, allowMissingImages?: boolean) => Promise<void> }) {
  const [draft, setDraft] = useState<FoodDraft>(() => { const {id,version,category,foodGroup,name,brand,preparation,baseQuantity,unit,servingQuantity,servingUnit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}=initial;return structuredClone({id,version,category,foodGroup,name,brand,preparation,baseQuantity,unit,servingQuantity,servingUnit,nutrition,sourceKind,basis,evidenceUrl,imageIds,expectedImageCount}); });
  const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState("");
  const signature=(value:FoodDraft)=>JSON.stringify({...value,name:value.name.trim(),baseQuantity:numericDraftValue(value.baseQuantity),nutrition:Object.fromEntries(Object.entries(value.nutrition).map(([k,v])=>[k,numericDraftValue(v)]))});
  const [initialSignature] = useState(() => signature(draft));
  useDraftGuard(signature(draft) !== initialSignature, uploading);
  return <form data-entry-form="food" className={styles.form} aria-busy={busy} onSubmit={e => { e.preventDefault(); void save(draft,true); }}><fieldset disabled={busy||uploading}>
    <label>分类<select aria-label="食材分类" value={draft.category??"ingredient"} onChange={e=>setDraft({...draft,category:e.target.value as "meal"|"ingredient"})}><option value="ingredient">食材</option><option value="meal">整餐</option></select></label>
    {draft.category !== "meal" && <label>食材分组<select aria-label="食材分组" value={draft.foodGroup ?? ""} onChange={event => setDraft(current => ({ ...current, foodGroup: (event.target.value || null) as FoodGroup | null }))}><option value="">未分类</option>{foodGroups.map(group => <option key={group} value={group}>{foodGroupLabels[group]}</option>)}</select></label>}
    <label>食材／产品名称<input required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className={styles.formColumns}><label><span className={styles.fieldCaption}>品牌<small>选填</small></span><input aria-label="品牌（可选）" value={draft.brand ?? ""} onChange={e => setDraft({ ...draft, brand: e.target.value || null })} /></label><label><span className={styles.fieldCaption}>规格／做法<small>选填</small></span><input aria-label="规格／做法（可选）" placeholder="口味、净重、生／熟…" value={draft.preparation ?? ""} onChange={e => setDraft({ ...draft, preparation: e.target.value || null })} /></label></div>
    <div className={styles.formColumns}><label>营养对应数量<DecimalInput min={0.01} max={1000000} required value={draft.baseQuantity} onValue={value=>setDraft({...draft,baseQuantity:value})}/></label><label>单位<input required maxLength={30} placeholder="包／只／份／g／ml" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} /></label></div>
    <p className={styles.foodBasis}>{draft.baseQuantity&&draft.unit?<span>每{Number(draft.baseQuantity)}{draft.unit}营养</span>:<span>填写每份营养</span>}{draft.servingQuantity&&draft.servingUnit&&<span>1{draft.servingUnit}＝{Number(draft.servingQuantity)}{draft.unit}</span>}</p><NutritionFields value={draft.nutrition} change={nutrition => setDraft({ ...draft, nutrition })} /><SourceFields value={draft} change={fields => setDraft({ ...draft, ...fields })} detailed={submitLabel==="应用修改"} />
    <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(d=>({...d,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(d=>({...d,imageIds}))} busy={busy} onBusy={setUploading} onError={setPhotoError}/>
    {(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<p className={styles.hint}>照片未齐，可先保存文字，之后补传。</p>}{photoError&&<p className={styles.hint}>{photoError} 可先保存文字。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={uploading} type="submit" className={styles.save}>{busy ? "正在处理…" : submitLabel}</button>
  </fieldset></form>;
}
