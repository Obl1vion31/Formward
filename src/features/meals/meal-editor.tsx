"use client";
import {DateField} from "@/components/date-field";
import { MealPhotoEntry, type AppliedMeal } from "../assistant/meal-photo-entry";
import { useOptionalAssistantChat } from "../assistant/chat-client";
import {LocalLoading} from "@/components/local-loading";
import {mealWebIssue} from "../records/web-entry";
import { useDraftGuard } from "@/components/draft-guard";
import { createWorkspaceExchange } from "@/components/workspace-motion";
import { MealDuplicateNotice } from "./meal-duplicate-notice";
import { useId, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  decimal, defaultFoodQuantity, emptyNutrition, foodGroupLabels, mealContentKey, mealTypeLabel,
  metricLabels, metrics, nutritionFor, sumNutrition, type FoodView, type ItemDraft, type ItemView,
  type MealDraft, type MealSnapshot, type MealView,
} from "./model";
import { FoodPickerCard } from "./presets";
import { editorItem, freeEditorItem, mealEditorInput, mealDraftSignature, emptyEditorItem, type EditorItem, type EditorMeal } from "./meal-editor-state";
import { MealEntryReadings, nutrientUnit } from "./meal-entry-readings";
import { MealEntryRow } from "./meal-entry-row";
import { PhotoFields } from "./photos";
import common from "./meals.module.css";
import styles from "./meal-editor.module.css";
import motion from "./meal-editor-motion.module.css";

const dragType = "application/x-formward-food";
const categories = ["all", "meat", "vegetable", "staple", "other", "meal"] as const;
type Category = (typeof categories)[number];
const categoryLabels = { all: "全部", meal: "整餐", ...foodGroupLabels };

type Props = {
  initial: MealDraft;
  foods: FoodView[];
  historicalFoods?: FoodView[];
  historicalItems?: ItemView[];
  foodRefs?: Record<string, FoodView>;
  recentMeals?: MealView[];
  submitLabel?: string;
  error: string;
  busy: boolean;
  save: (input: MealDraft, allowMissingImages?: boolean) => Promise<void>;
  pending?: boolean;
  onRetry?: () => void;
  allowAi?: boolean;
  onAiSaved?: (snapshot: MealSnapshot) => void;
};

export function MealEditor({
  initial, foods, historicalFoods = [], historicalItems = [], foodRefs = {}, recentMeals = [],
  submitLabel = "保存餐次", error, busy, save, pending = false, onRetry, allowAi = true, onAiSaved,
}: Props) {
 const [aiOpen,setAiOpen]=useState(false),[aiWorking,setAiWorking]=useState(false),[aiSaving,setAiSaving]=useState(false),[aiError,setAiError]=useState("");
 const [aiBinding,setAiBinding]=useState<{taskId:string;revision:number}|null>(null),[resumeTaskId,setResumeTaskId]=useState<string|undefined>();
 const [aiDraftKey,setAiDraftKey]=useState<string|null>(null);
 const aiOpeningSignature=useRef(""),resumed=useRef(false),chat=useOptionalAssistantChat();
 const canMealAi=chat?.entitlement?.mealRecognition??(chat?.enabled&&chat.data?.capabilities?.mealEntry)??false;
 const capabilitiesRequested=useRef(false);
 useEffect(()=>{if(chat&&!pending&&allowAi&&canMealAi&&!chat?.entitlement&&!chat?.data&&!capabilitiesRequested.current){capabilitiesRequested.current=true;void chat.refresh();}},[pending,allowAi,chat,canMealAi]);
 const totalsBar=useRef<HTMLElement>(null),aiTrigger=useRef<HTMLButtonElement>(null);
 useLayoutEffect(()=>{const node=totalsBar.current,dialog=node?.closest('dialog');if(!node||!dialog)return;const measure=()=>dialog.style.setProperty("--entry-footer-height",node.getBoundingClientRect().height+"px");measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>{observer.disconnect();dialog.style.removeProperty("--entry-footer-height");};},[aiOpen]);
 const submitting=useRef(false),[invalid,setInvalid]=useState(false);
 const search = useRef<HTMLInputElement>(null);
 const libraryTrigger = useRef<HTMLButtonElement>(null);
 const panelTitle = useRef<HTMLHeadingElement>(null);
 const rows = useRef<HTMLUListElement>(null);
 const root = useRef<HTMLDivElement>(null);
 const priorScroll = useRef(0);
 const mealPane = useRef<HTMLDivElement>(null);
 const libraryPane = useRef<HTMLElement>(null);
 const exchange = useMemo(() => createWorkspaceExchange(), []);
 const [libraryOpen,setLibraryOpen]=useState(false);
 const [paneChange,setPaneChange]=useState<{ direction: "forward" | "back"; scroll: number; animate: boolean } | null>(null);
 useLayoutEffect(() => {
   if (!paneChange) {
     exchange.stop();
     return;
   }

   const enteringLibrary = paneChange.direction === "forward";
   const scroller = root.current?.closest("dialog");
   if (scroller) scroller.scrollTop = enteringLibrary ? 0 : priorScroll.current;
   const enter = enteringLibrary ? libraryPane.current : mealPane.current;
   const exit = enteringLibrary ? mealPane.current : libraryPane.current;
   const finish = () => setPaneChange(current => current === paneChange ? null : current);

   if (paneChange.animate && enter && exit) {
     exit.style.setProperty("--meal-pane-exit-offset", ((scroller?.scrollTop ?? 0) - paneChange.scroll) + "px");
     exchange.play(enter, exit, enteringLibrary ? 1 : -1, finish);
   } else {
     finish();
   }

   const focus = enteringLibrary ? panelTitle.current : libraryTrigger.current;
   focus?.focus({ preventScroll: true });
 }, [paneChange, exchange]);
 useLayoutEffect(() => () => exchange.stop(), [exchange]);
 const [draft,setDraft]=useState<EditorMeal>(()=>({...structuredClone(initial),mealType:mealTypeLabel(initial.mealType),items:[...initial.items.map((item,index)=>{
  const saved=item.originalItemId?historicalItems.find(previous=>previous.id===item.originalItemId):historicalItems[index];
  return editorItem(item,index,saved?.nutrition,!!(item.foodId||item.foodRef||item.foodDraft||saved?.foodSnapshot));
 }),freeEditorItem(initial.items.length)]}));
 const [freeKey, setFreeKey] = useState<number | null>(null);
 const [collapsed, setCollapsed] = useState<number[]>([]);
 const [query, setQuery] = useState("");
 const [category, setCategory] = useState<Category>("all");
 const [selected, setSelected] = useState<string[]>([]);
 const [replacing, setReplacing] = useState<number | null>(null);
 const [dragging, setDragging] = useState(false);
 const bubbleId = useId(), nutritionHint = bubbleId + "-nutrition";
 const [uploading, setUploading] = useState(false);
 const [photoError, setPhotoError] = useState("");
 const draftSignature = mealDraftSignature(draft);
 const [initialSignature] = useState(draftSignature);
  const liveDraft=useRef(draft);useLayoutEffect(()=>{liveDraft.current=draft;},[draft]);
  useDraftGuard(draftSignature!==initialSignature||aiOpen||!!aiBinding,uploading||aiWorking||aiSaving);
 function itemFood(item:ItemDraft){return item.foodRef?foodRefs[item.foodRef]:item.foodId?historicalFoods.find(food=>food.id===item.foodId&&food.version===item.foodVersion)??foods.find(food=>food.id===item.foodId):item.foodDraft??historicalItems.find(previous=>previous.id===item.originalItemId)?.foodSnapshot;}
 function values(item:ItemDraft){const food=itemFood(item);return food?item.quantity&&decimal.safeParse(item.quantity).success&&Number(item.quantity)>0?nutritionFor(food,item.quantity,item.unit??food.unit):emptyNutrition():item.nutrition??emptyNutrition();}
 function setItem(index:number,next:EditorItem){setDraft(previous=>{
 const items=previous.items.map((item,n)=>{
 if(n!==index)return item;
 if(next.quantity!==item.quantity||next.unit!==item.unit)next={...next,reviewExplanation:{...next.reviewExplanation,amount:{source:"user",basis:next.quantity?`填写食用量：${Number(next.quantity)}${next.unit??""}`:"保留未知食用量。"}}};
 if(JSON.stringify(next.perPortionNutrition??next.nutrition)!==JSON.stringify(item.perPortionNutrition??item.nutrition))next={...next,reviewExplanation:{...next.reviewExplanation,nutrition:{source:"user",basis:next.editor.caloriesAutomatic?"按本次蛋白质×4＋碳水×4＋脂肪×9计算热量。":"手动填写营养数值，口径以本项营养标识为准。"}}};
 return next;
 });
 if(items.at(-1)?.name.trim())items.push(freeEditorItem(Math.max(...items.map(item=>item.editor.key))+1));
 return {...previous,items};
 });}
 function editorIsWide() {
   return matchMedia("(min-width:701px) and (pointer:fine)").matches
     && (root.current?.clientWidth ?? 0) >= 960;
 }

 function showLibrary(replace: number | null = null) {
   setReplacing(replace);
   setSelected([]);
   if (editorIsWide()) {
     search.current?.focus({ preventScroll: true });
     return;
   }
   const scroll = root.current?.closest("dialog")?.scrollTop ?? 0;
   priorScroll.current = scroll;
   setLibraryOpen(true);
   setPaneChange({ direction: "forward", scroll, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
 }

 function returnToMeal() {
   setLibraryOpen(false);
   setSelected([]);
   setReplacing(null);
   if (editorIsWide()) return;
   const scroll = root.current?.closest("dialog")?.scrollTop ?? 0;
   setPaneChange({ direction: "back", scroll, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
 }

 function addFoods(chosen: FoodView[]) {
   if (!chosen.length || busy || uploading) return;
   setDraft(previous => {
     const remaining = 50 - previous.items.filter(item => !emptyEditorItem(item)).length;
     let key = Math.max(...previous.items.map(item => item.editor.key)) + 1;
     const makeRow = (food: FoodView, rowKey: number) => {
       const packaged = !!(food.servingQuantity && food.servingUnit);
       const quantity = packaged ? "1" : defaultFoodQuantity(food.unit);
       return editorItem({
         kind: "food", name: food.name, foodId: food.id, foodVersion: food.version, quantity,
         amountDecision: quantity ? "provided" : undefined, unit: packaged ? food.servingUnit : food.unit,
         sourceKind: food.sourceKind,
       }, rowKey, undefined, true);
     };
     return {
       ...previous,
       items: replacing === null
         ? [...previous.items.slice(0, -1), ...chosen.slice(0, Math.max(0, remaining)).map(food => makeRow(food, key++)), previous.items.at(-1)!]
         : previous.items.map((item, index) => index === replacing ? makeRow(chosen[0], item.editor.key) : item),
     };
   });
   if (libraryOpen) returnToMeal();
   else setReplacing(null);
 }

 function changeSelection(food: FoodView) {
   setSelected(previous => {
     if (previous.includes(food.id)) return previous.filter(id => id !== food.id);
     if (replacing !== null) return [food.id];
     return previous.length + entered.length < 50 ? [...previous, food.id] : previous;
   });
 }

 const availableFoods = foods.filter(food => !food.deletedAt);
 const results = availableFoods.filter(food => {
   const group = food.category === "meal" ? "meal" : food.foodGroup ?? "other";
   const text = [food.name, food.brand, food.preparation].filter(Boolean).join(" ").toLowerCase();
   return (category === "all" || group === category) && text.includes(query.trim().toLowerCase());
 });
 const entered=draft.items.filter(item=>!emptyEditorItem(item)),totals=sumNutrition(entered.map(values));
 const input=mealEditorInput(draft);
 const entryIssue=entered.some(item=>!item.name.trim())?"请填写食物名称。":entered.find(item=>item.editor.calorieIssue)?.editor.calorieIssue??mealWebIssue(input,totals.values),blocked=pending||busy||uploading||aiSaving||invalid||!!entryIssue;
 const contentKey=mealContentKey({...input,items:input.items.map((item,index)=>({...item,name:itemFood(entered[index])?.name??item.name,nutrition:values(entered[index])}))});
 const duplicate=!entryIssue&&recentMeals.some(meal=>!meal.deletedAt&&meal.id!==draft.id&&mealContentKey(meal)===contentKey);
 const attachments = useRef<HTMLDetailsElement>(null);

 function openManual() {
   if (entered.length >= 50) return;
   const key = draft.items.at(-1)!.editor.key;
   setCollapsed(current => current.filter(value => value !== key));
   setFreeKey(key);
   requestAnimationFrame(() => rows.current?.querySelector<HTMLInputElement>('[data-blank-row] input')?.focus());
 }

 function restoredDraft(value:MealDraft){
   const next={...structuredClone(value),items:[...value.items.map((item,index)=>editorItem(item,index,historicalItems.find(old=>old.id===item.originalItemId)?.nutrition,!!(item.foodId||item.foodRef||item.foodDraft))),freeEditorItem(value.items.length)]};
   liveDraft.current=next;setDraft(next);aiOpeningSignature.current=mealDraftSignature(next);return next;
 }
 function openAi(){if(!allowAi||!canMealAi||!onAiSaved)return;aiOpeningSignature.current=mealDraftSignature(liveDraft.current);if(!aiDraftKey)setAiDraftKey(crypto.randomUUID());setResumeTaskId(undefined);setAiError("");setAiOpen(true);}
 function applyAi(value:AppliedMeal){
   if(mealDraftSignature(liveDraft.current)!==aiOpeningSignature.current){setAiError("原草稿已变化，识别结果已保留，请重新核对后再添加。");return;}
   restoredDraft(value.draft);setAiBinding({taskId:value.taskId,revision:value.operation.revision});setCollapsed([]);setFreeKey(null);setAiOpen(false);setAiWorking(false);
 }
 useLayoutEffect(()=>{const id=new URL(location.href).searchParams.get("aiTask");if(id&&!resumed.current&&allowAi&&canMealAi&&onAiSaved){resumed.current=true;const frame=requestAnimationFrame(()=>{aiOpeningSignature.current=mealDraftSignature(liveDraft.current);setResumeTaskId(id);setAiOpen(true);});return()=>cancelAnimationFrame(frame);}},[allowAi,canMealAi,onAiSaved]);

 const visibleRows = draft.items.map((item, index) => ({ item, index }))
   .filter(({ item }) => !emptyEditorItem(item) || item.editor.key === freeKey);
 const canPick = entered.length < 50 || replacing !== null;

 async function submit(event: FormEvent<HTMLFormElement>) {
   event.preventDefault();
   if (blocked || submitting.current) return;
   submitting.current = true;
   try {
     setAiError("");
     if (!aiBinding) {
       await save(mealEditorInput(draft), true);
       return;
     }
     setAiSaving(true);
     const response = await fetch("/api/assistant-meal", {
       method: "POST", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ action: "save", taskId: aiBinding.taskId, revision: aiBinding.revision, draft: mealEditorInput(draft) }),
     });
     const result = await response.json();
     if (!response.ok) throw Error(result.error ?? "保存未完成，当前草稿仍保留。");
     window.dispatchEvent(new Event("formward-assistant-updated"));
     onAiSaved?.(result.snapshot);
   } catch (failure) {
     setAiError(failure instanceof Error ? failure.message : "保存未完成，请重试。");
   } finally {
     submitting.current = false;
     setAiSaving(false);
   }
 }

 return <div className={styles.editor} ref={root} data-meal-editor data-photo-active={aiOpen || undefined}>
   <form className={common.form + " " + styles.mealForm} hidden={aiOpen}
     data-entry-form={pending ? "meal-pending" : "meal"} data-library-open={libraryOpen || undefined}
     aria-busy={busy || pending && !error} onSubmit={submit}
     onKeyDown={event => {
       if (event.key !== "Escape" || !libraryOpen || editorIsWide()) return;
       event.preventDefault();
       event.stopPropagation();
       returnToMeal();
     }}
     onChange={event => setInvalid(Boolean(event.currentTarget.querySelector(":invalid")))}>
     <fieldset disabled={busy || uploading || pending || aiSaving || aiWorking}>
       <div className={styles.columns + " " + motion.stage} data-meal-pane-transition={paneChange?.animate ? paneChange.direction : undefined}>
       <div ref={mealPane} className={motion.mealPane} data-meal-pane="meal" inert={paneChange?.animate && libraryOpen}>
       <div className={styles.mealContext}>
         <div className={styles.dateFields}>
           <label>日期
             <span className={styles.compactField}><DateField aria-label="日期" required value={draft.date}
               onChange={event => setDraft({ ...draft, date: event.target.value, occurredAt: null })}/></span>
           </label>
           <label>餐次
             <span className={styles.compactField}><input aria-label="餐次" required maxLength={50} list="meal-types" value={draft.mealType}
               onChange={event => setDraft({ ...draft, mealType: event.target.value })}/></span>
           </label>
           <datalist id="meal-types">{["早餐", "午餐", "晚餐", "加餐", "夜宵"].map(name => <option key={name}>{name}</option>)}</datalist>
         </div>
         {duplicate && <MealDuplicateNotice date={draft.date}/>}
       </div>

         <section className={styles.entry} aria-labelledby={bubbleId + "-foods"} data-dragging={dragging || undefined}
           onDragOver={event => {
             if (!event.dataTransfer.types.includes(dragType)) return;
             event.preventDefault();
             event.dataTransfer.dropEffect = "copy";
             setDragging(true);
           }}
           onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
           onDrop={event => {
             if (!event.dataTransfer.types.includes(dragType)) return;
             event.preventDefault();
             setDragging(false);
             try {
               const value = JSON.parse(event.dataTransfer.getData(dragType));
               const match = availableFoods.find(food => food.id === value.id && food.version === value.version);
               if (match) addFoods([match]);
             } catch { /* Only the library's drag format is accepted. */ }
           }}>
           <div className={styles.foodHeading}>
             <h2 id={bubbleId + "-foods"}>本餐食物</h2>
             <button ref={libraryTrigger} type="button" className={styles.libraryLink} aria-label="从食材库添加"
               aria-controls={bubbleId + "-picker"} aria-expanded={libraryOpen} disabled={!canPick} onClick={() => showLibrary()}>
               食材库 <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
             </button>
           </div>
           <div className={styles.methods} role="group" aria-label="记录方式">
             <button type="button" onClick={openManual} disabled={entered.length >= 50}>
               <span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>手动填写</span>
             </button>
             {allowAi && <button ref={aiTrigger} type="button" data-meal-ai-entry aria-label="AI 拍照录入"
               disabled={pending || !canMealAi || !onAiSaved}
               title={pending || !chat?.entitlement && !chat?.data ? "正在读取识图权限" : !canMealAi ? "当前暂不可用" : undefined}
               onClick={openAi}>
               <span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.25"/></svg>拍照录入</span>
             </button>}
           </div>

           {visibleRows.length > 0 && <div className={styles.foodRows}>
             <div className={styles.rowHeadings} aria-hidden="true">
               <span>食物名称</span><span>数量</span><span>单位</span>
               {metrics.map(metric => <span key={metric}>{metricLabels[metric]} <small>{nutrientUnit(metric)}</small></span>)}
             </div>
             <ul className={styles.rowList} ref={rows} aria-label="本餐已添加食物">
               {visibleRows.map(({ item, index }) => <MealEntryRow key={item.editor.key} item={item} index={index}
                 blank={emptyEditorItem(item)} food={itemFood(item)} nutrition={values(item)} nutritionHint={nutritionHint}
                 nutritionOpen={!collapsed.includes(item.editor.key)} update={next => setItem(index, next)}
                 toggleNutrition={() => setCollapsed(previous => previous.includes(item.editor.key)
                   ? previous.filter(key => key !== item.editor.key) : [...previous, item.editor.key])}
                 replace={() => showLibrary(index)} remove={() => {
                   if (!emptyEditorItem(item)) setDraft(previous => {
                     const items = previous.items.filter((_, itemIndex) => itemIndex !== index);
                     if (index === previous.items.length - 1) items.push(freeEditorItem(item.editor.key));
                     return { ...previous, items };
                   });
                   if (freeKey === item.editor.key) setFreeKey(null);
                 }}/>)}
             </ul>
           </div>}
           <datalist id="meal-portion-units">{["g", "mL", "份", "个", "只", "碗", "杯", "包", "勺"].map(unit => <option key={unit} value={unit}/>)}</datalist>
           <p id={nutritionHint} className="sr-only">填写本次总营养，三项填全后按4／4／9计算热量，也可手填。食材库按份量换算。</p>

           <div className={styles.extras}>
             <details>
               <summary><span>备注 <small>选填</small></span>{draft.notes && <span className={styles.notePreview}>{draft.notes}</span>}</summary>
               <textarea aria-label="餐次备注" rows={2} maxLength={12000} value={draft.notes ?? ""}
                 placeholder="补充食物、份量或做法"
                 onChange={event => setDraft({ ...draft, notes: event.target.value || null })}/>
             </details>
             <details ref={attachments}>
               <summary><span>附照片 <small>{draft.imageIds?.length ? draft.imageIds.length + " 张" : "选填"}</small></span></summary>
               <PhotoFields expectedCount={draft.expectedImageCount}
                 onExpected={expectedImageCount => setDraft(previous => ({ ...previous, expectedImageCount }))}
                 ids={draft.imageIds ?? []} change={imageIds => setDraft(previous => ({ ...previous, imageIds }))}
                 busy={busy} onBusy={setUploading} onError={message => {
                   setPhotoError(message);
                   if (message && attachments.current) attachments.current.open = true;
                 }}/>
             </details>
           </div>
           {(error.includes("相同") || draft.allowDuplicate) && <label className={common.checkbox}>
             <input type="checkbox" checked={Boolean(draft.allowDuplicate)}
               onChange={event => setDraft({ ...draft, allowDuplicate: event.target.checked })}/>这是另一次进食，仍然新增
           </label>}
           {(draft.expectedImageCount ?? 0) > (draft.imageIds?.length ?? 0) && <p className={common.hint}>照片未齐，可直接保存文字，之后补传。</p>}
           {photoError && <p className={common.hint}>{photoError} 可先保存文字。</p>}
         </section>
       </div>
         <section ref={libraryPane} className={styles.library} data-meal-pane="library" inert={paneChange?.animate && !libraryOpen}
           id={bubbleId + "-picker"} aria-label="选择食材库">
           <div className={styles.libraryTitle}>
             <button type="button" className={styles.libraryBack} aria-label="返回本餐" onClick={returnToMeal}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>
             </button>
             <h2 ref={panelTitle} tabIndex={-1}>食材库</h2>
           </div>
           <label className={styles.librarySearch + " " + styles.compactField}><span className="sr-only">搜索食材</span>
             <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
             <input aria-label="搜索食材" ref={search} type="search" placeholder="搜索名称、品牌或规格" value={query}
               onChange={event => setQuery(event.target.value)}/>
           </label>
           {replacing !== null && <div className={styles.replacing} role="status">
             选择食材以替换当前项<button type="button" onClick={returnToMeal}>取消更换</button>
           </div>}
           <div className={styles.libraryBody}>
             <div className={styles.categories} role="group" aria-label="食材分类">
               {categories.map(key => <button type="button" key={key} aria-pressed={category === key}
                 onClick={() => setCategory(key)}>{categoryLabels[key]}</button>)}
             </div>
             <div className={styles.results} data-meal-library-results>
               {!pending && results.map(food => <FoodPickerCard key={food.id} food={food}
                 chosen={selected.includes(food.id)} choose={() => addFoods([food])} toggle={() => changeSelection(food)}
                 replacing={replacing !== null} disabled={!canPick || libraryOpen && selected.length + entered.length >= 50 && !selected.includes(food.id)}
                 onDragStart={event => {
                   event.dataTransfer.setData(dragType, JSON.stringify({ id: food.id, version: food.version }));
                   event.dataTransfer.effectAllowed = "copy";
                 }}/>)}
               {!pending && !results.length && <p className={common.hint}>{query.trim() ? "没有匹配的食材" : "这个分类还没有食材"}</p>}
             </div>
           </div>
         </section>

       </div>
     </fieldset>

     <footer ref={totalsBar} className={styles.footer} data-meal-footer>
       <div className={styles.saveRow}>
         {entered.length > 0 ? <div className={styles.totals} aria-label="本餐合计">
           <div className={styles.totalLabel}>本餐合计{metrics.some(metric => totals.incomplete[metric] && totals.values[metric] !== null) && <small>已知部分</small>}</div>
           <MealEntryReadings nutrition={totals.values}/>
         </div> : pending && !error ? <LocalLoading/> : <span className={common.hint} role={pending ? "alert" : undefined}>{pending ? error : "尚未添加食物"}</span>}
         <button className={styles.saveButton} type={onRetry ? "button" : "submit"}
           data-entry-primary-action aria-label={(onRetry ? "重新读取" : submitLabel) + " · " + draft.date}
           disabled={!onRetry && blocked} onClick={onRetry}>
           {onRetry ? "重新读取" : busy || aiSaving ? "正在处理…" : submitLabel}
         </button>
         {!pending && entered.length > 0 && entryIssue && <p className={styles.entryIssue} role="status">{entryIssue}</p>}
         {!pending && (error || aiError) && <p className={common.error + " " + styles.entryIssue} role="alert">{error || aiError}</p>}
       </div>
       <div className={styles.libraryFooter}>
         <span aria-live="polite">{selected.length > 0 ? "已选 " + selected.length + " 项" : "选择要加入的食材"}</span>
         <button type="button" className={styles.saveButton} disabled={!selected.length || busy} onClick={() => {
           const byId = new Map(availableFoods.map(food => [food.id, food]));
           addFoods(selected.flatMap(id => byId.get(id) ?? []));
         }}>加入本餐</button>
       </div>
     </footer>
   </form>
   {(aiDraftKey || resumeTaskId) && <div hidden={!aiOpen} className={styles.photoMode}>
     <MealPhotoEntry sharedHeader visible={aiOpen} initial={mealEditorInput(draft)}
       draftKey={aiDraftKey ?? "00000000-0000-4000-8000-000000000000"} resumeTaskId={resumeTaskId}
       onRestore={restoredDraft} onApply={applyAi} onBack={() => {
         setAiOpen(false);
         setAiWorking(false);
         requestAnimationFrame(() => aiTrigger.current?.focus({ preventScroll: true }));
       }} onBusy={setAiWorking}/>
   </div>}
 </div>;
}
