"use client";
import {DateField} from "@/components/date-field";
import { MealPhotoEntry, type AppliedMeal } from "../assistant/meal-photo-entry";
import { useOptionalAssistantChat } from "../assistant/chat-client";
import {LocalLoading} from "@/components/local-loading";
import {mealWebIssue} from "../records/web-entry";
import { useDraftGuard, useInspectorStep } from "@/components/draft-guard";
import { useMobileMode } from "@/components/use-mobile-mode";
import { createWorkspaceExchange } from "@/components/workspace-motion";
import { MealDuplicateNotice } from "./meal-duplicate-notice";
import { useCallback, useId, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  decimal, defaultFoodQuantity, emptyNutrition, foodGroupLabels, mealContentKey, mealTypeLabel,
  metricLabels, metrics, nutritionFor, sumNutrition, type FoodDraft, type FoodView, type ItemDraft, type ItemView,
  type MealDraft, type MealSnapshot, type MealView,
} from "./model";
import { FoodPickerCard } from "./presets";
import { FoodLibraryTabs, ReferenceBrowser, type FoodLibraryScope, type ReferenceBack } from "./reference-browser";
import { ReferenceDetails, type ReferencePick } from "./reference-details";
import type { RecipeEdit } from "./reference-recipe-details";
import { referenceNutrition, type ReferenceFood } from "./reference-food";
import { recipeTotals, resolveRecipePart, sameRecipeParts, wholeRecipeParts } from "./reference-recipe";
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
const referenceKey = (food: { id: string; version: number }) => food.id + ":" + food.version;

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
 const mobile = useMobileMode();
 const search = useRef<HTMLInputElement>(null);
 const libraryTrigger = useRef<HTMLButtonElement>(null);
 const panelTitle = useRef<HTMLHeadingElement>(null);
 const recipeHeading = useRef<HTMLHeadingElement>(null);
 const [recipeEdit, setRecipeEdit] = useState<RecipeEdit | null>(null);
 const rows = useRef<HTMLUListElement>(null);
 const root = useRef<HTMLDivElement>(null);
 const priorScroll = useRef(0);
 const returnRow = useRef<number | null>(null);
 const manualFocus = useRef<number | null>(null);
 const focusMeal = useCallback(() => {
   const key = manualFocus.current ?? returnRow.current;
   const row = key === null ? null : rows.current?.querySelector('[data-meal-row-key="' + key + '"]');
   const manual = manualFocus.current !== null;
   const control = row?.querySelector<HTMLElement>(manual ? '[data-meal-name]' : 'button[popovertarget$="-more"]');
   manualFocus.current = null;
   (control ?? libraryTrigger.current)?.focus({ preventScroll: !manual });
 }, []);
 const mealPane = useRef<HTMLDivElement>(null);
 const libraryPane = useRef<HTMLElement>(null);
 const exchange = useMemo(() => createWorkspaceExchange(), []);
 const [libraryOpen, setLibraryOpen] = useState(false);
 const [inlineLibrary, setInlineLibrary] = useState(false);
 const [libraryVisit, setLibraryVisit] = useState(0);
 const [paneChange,setPaneChange]=useState<{ direction: "forward" | "back"; scroll: number; animate: boolean } | null>(null);
 const currentPaneChange = useRef<typeof paneChange>(null);
 useLayoutEffect(() => {
   currentPaneChange.current = paneChange;
   if (!paneChange) {
     exchange.stop();
     return;
   }

   const enteringLibrary = paneChange.direction === "forward";
   const scroller = root.current?.closest("dialog");
   if (scroller) scroller.scrollTop = enteringLibrary ? 0 : priorScroll.current;
   const enter = enteringLibrary ? libraryPane.current : mealPane.current;
   const exit = enteringLibrary ? mealPane.current : libraryPane.current;
   const finish = () => {
     if (currentPaneChange.current !== paneChange) return;
     setPaneChange(null);
     if (!enteringLibrary) {
       setLibraryVisit(visit => visit + 1);
       setRecipeEdit(null);
     }
   };

   if (paneChange.animate && enter && exit) {
     exit.style.setProperty("--meal-pane-exit-offset", ((scroller?.scrollTop ?? 0) - paneChange.scroll) + "px");
     exchange.play(enter, exit, enteringLibrary ? 1 : -1, finish);
   } else {
     finish();
   }

   if (enteringLibrary) requestAnimationFrame(() => {
     const heading = recipeHeading.current ?? scroller?.querySelector<HTMLElement>("[data-inspector-step-title]") ?? panelTitle.current;
     heading?.focus({ preventScroll: true });
   });
   else focusMeal();
 }, [paneChange, exchange, focusMeal]);
 useLayoutEffect(() => () => exchange.stop(), [exchange]);
 useLayoutEffect(() => {
   const editor = root.current;
   if (!editor) return;
   const desktop = matchMedia("(min-width: 701px) and (pointer: fine)");
   let wasInline = false;
   function measure() {
     const inline = desktop.matches && (editor?.clientWidth ?? 0) >= 960;
     if (wasInline && !inline && libraryPane.current?.contains(document.activeElement)) {
       setLibraryOpen(true);
     }
     if (inline && !wasInline) {
       if (currentPaneChange.current?.direction === "back") setLibraryVisit(visit => visit + 1);
       setLibraryOpen(false);
       setPaneChange(null);
     }
     wasInline = inline;
     setInlineLibrary(inline);
   }
   const observer = new ResizeObserver(measure);
   observer.observe(editor);
   desktop.addEventListener("change", measure);
   measure();
   return () => {
     observer.disconnect();
     desktop.removeEventListener("change", measure);
   };
 }, []);
 const [draft,setDraft]=useState<EditorMeal>(()=>({...structuredClone(initial),mealType:mealTypeLabel(initial.mealType),items:[...initial.items.map((item,index)=>{
  const saved=item.originalItemId?historicalItems.find(previous=>previous.id===item.originalItemId):historicalItems[index];
  return editorItem(item,index,saved?.nutrition,!!(item.foodId||item.foodRef||item.foodDraft||item.referenceFood||saved?.foodSnapshot));
 }),freeEditorItem(initial.items.length)]}));
 const [freeKey, setFreeKey] = useState<number | null>(null);
 const [collapsed, setCollapsed] = useState<number[]>([]);
 const [query, setQuery] = useState("");
 const [category, setCategory] = useState<Category>("all");
 const [scope, setScope] = useState<FoodLibraryScope>("reference");
 const [referenceFoods, setReferenceFoods] = useState<Record<string, ReferenceFood>>({});
 const [selected, setSelected] = useState<string[]>([]);
 const [referenceBack, setReferenceBack] = useState<ReferenceBack | null>(null);
 const onDetailBack = useCallback((back: ReferenceBack | null) => setReferenceBack(back), []);
 const [replacing, setReplacing] = useState<number | null>(null);
 const [dragging, setDragging] = useState(false);
 const bubbleId = useId(), nutritionHint = bubbleId + "-nutrition";
 const [uploading, setUploading] = useState(false);
 const [photoError, setPhotoError] = useState("");
 const draftSignature = mealDraftSignature(draft);
 const [initialSignature] = useState(draftSignature);
  const liveDraft=useRef(draft);useLayoutEffect(()=>{liveDraft.current=draft;},[draft]);
  useDraftGuard(draftSignature!==initialSignature||aiOpen||!!aiBinding,uploading||aiWorking||aiSaving);
 function itemReference(item: ItemDraft) {
   if (!item.referenceFood) return undefined;
   const key = referenceKey(item.referenceFood);
   const historical = item.originalItemId ? historicalItems.find(entry => entry.id === item.originalItemId)?.referenceSnapshot?.food : undefined;
   return historical && referenceKey(historical) === key ? historical : referenceFoods[key];
 }

 function recipePartFood(item: ItemDraft, recipe: ReferenceFood | undefined, part: { id: string; version: number }) {
   const key = referenceKey(part);
   const saved = historicalItems.find(entry => entry.id === item.originalItemId)?.referenceSnapshot?.recipeParts;
   return saved?.find(entry => referenceKey(entry.food) === key)?.food ??
     recipe?.components?.find(entry => referenceKey(entry.food) === key)?.food ??
     recipe?.recipe?.suggestedFoods.find(entry => referenceKey(entry) === key) ??
     referenceFoods[key];
 }

 function unchangedReferenceItem(item: ItemDraft) {
   const link = item.referenceFood;
   if (!link || !item.originalItemId) return undefined;
   const historical = historicalItems.find(entry => entry.id === item.originalItemId);
   const previous = historical?.referenceFood;
   if (previous && referenceKey(previous) === referenceKey(link) && previous.portionId === link.portionId &&
     historical.unit === item.unit && Number(historical.quantity ?? 0) === Number(item.quantity ?? 0) &&
     sameRecipeParts(previous.parts, link.parts)) return historical;
 }

 function itemRecipeParts(item: ItemDraft, recipe = itemReference(item)) {
   if (!recipe?.recipe || !item.referenceFood) return [];
   const savedParts = unchangedReferenceItem(item)?.referenceSnapshot?.recipeParts;
   if (savedParts) return savedParts;
   if (item.referenceFood.parts) return item.referenceFood.parts.flatMap(part => {
     const food = recipePartFood(item, recipe, part);
     const resolved = food && resolveRecipePart(recipe, food, part);
     return resolved ? [resolved] : [];
   });
   const amount = item.quantity;
   return amount && decimal.safeParse(amount).success && Number(amount) > 0
     ? wholeRecipeParts(recipe, amount, item.referenceFood.portionId) : [];
 }

 const missingReferences = [...new Set(draft.items.flatMap(item => {
   const link = item.referenceFood;
   if (!link) return [];
   const food = itemReference(item);
   if (!food) return [referenceKey(link)];
   return (link.parts ?? []).filter(part => !recipePartFood(item, food, part)).map(referenceKey);
 }))].join(",");
 useEffect(() => {
   if (!missingReferences) return;
   const abort = new AbortController();
   void Promise.allSettled(missingReferences.split(",").map(async key => {
     const id = key.split(":")[0];
     const response = await fetch("/api/meal-reference-foods?id=" + encodeURIComponent(id), { signal: abort.signal });
     if (!response.ok) return null;
     const { referenceFoods: [food] } = await response.json() as { referenceFoods: ReferenceFood[] };
     return food && referenceKey(food) === key ? [key, food] as const : null;
   })).then(results => {
     const entries = results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
     if (entries.length && !abort.signal.aborted) setReferenceFoods(previous => ({ ...previous, ...Object.fromEntries(entries) }));
   });
   return () => abort.abort();
 }, [missingReferences]);

 function itemFood(item: ItemDraft): FoodDraft | undefined {
   if (item.referenceFood) {
     const reference = itemReference(item);
     const portion = reference?.portions.find(entry => entry.id === item.referenceFood?.portionId) ?? reference?.portions[0];
     return {
       name: reference?.name ?? item.name, baseQuantity: "100", unit: reference?.basisUnit ?? "g", servingUnit: portion?.unit,
       servingQuantity: portion?.edibleGrams, nutrition: reference?.nutrition ?? emptyNutrition(),
       sourceKind: reference ? reference.sourceKind ?? "composition_table" : "unknown", basis: reference?.preparation, evidenceUrl: reference?.source.url,
     };
   }
   return item.foodRef ? foodRefs[item.foodRef] : item.foodId
     ? historicalFoods.find(food => food.id === item.foodId && food.version === item.foodVersion) ?? foods.find(food => food.id === item.foodId)
     : item.foodDraft ?? historicalItems.find(previous => previous.id === item.originalItemId)?.foodSnapshot;
 }

 function values(item: ItemDraft) {
   const quantity = item.quantity && decimal.safeParse(item.quantity).success && Number(item.quantity) > 0 ? item.quantity : null;
   if (item.referenceFood) {
     const historical = unchangedReferenceItem(item);
     if (historical) return historical.nutrition;
     const reference = itemReference(item);
     if (reference?.recipe) {
       const parts = itemRecipeParts(item, reference);
       return item.referenceFood.parts && parts.length !== item.referenceFood.parts.length ? emptyNutrition() : recipeTotals(parts).nutrition;
     }
     return reference ? referenceNutrition(reference, quantity, item.referenceFood.portionId).nutrition : emptyNutrition();
   }
   const food = itemFood(item);
   return food ? quantity ? nutritionFor(food, quantity, item.unit ?? food.unit) : emptyNutrition() : item.nutrition ?? emptyNutrition();
 }
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
 function showLibrary(replace: number | null = null, adjust = false) {
   const item = adjust && replace !== null ? draft.items[replace] : undefined;
   const food = item && itemReference(item);
   const edit = item && food?.recipe ? { item, food, parts: itemRecipeParts(item, food) } : null;
   setRecipeEdit(edit);
   if (edit) setScope("reference");
   setReplacing(replace);
   setSelected([]);
   returnRow.current = replace === null ? null : draft.items[replace].editor.key;
   const scroll = root.current?.closest("dialog")?.scrollTop ?? 0;
   priorScroll.current = scroll;
   if (inlineLibrary) {
     referenceBack?.action(false);
     requestAnimationFrame(() => {
       const target = edit ? recipeHeading.current : search.current;
       target?.scrollIntoView({ block: "nearest", behavior: "instant" });
       target?.focus({ preventScroll: true });
     });
     return;
   }
   setLibraryVisit(visit => visit + 1);
   setLibraryOpen(true);
   setPaneChange({ direction: "forward", scroll, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
 }

 function returnToMeal() {
   setLibraryOpen(false);
   setSelected([]);
   setReplacing(null);
   setInvalid(Boolean(mealPane.current?.querySelector(":invalid")));
   if (inlineLibrary) {
     referenceBack?.action(false);
     setRecipeEdit(null);
     requestAnimationFrame(focusMeal);
     return;
   }
   const scroll = root.current?.closest("dialog")?.scrollTop ?? 0;
   setPaneChange({ direction: "back", scroll, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
 }

 function backFromLibrary() {
   if (!recipeEdit && scope === "reference" && referenceBack) referenceBack.action();
   else returnToMeal();
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
   if (libraryOpen || inlineLibrary || replacing !== null) returnToMeal();
 }

 function addReference(picks: readonly ReferencePick[]) {
   if (!picks.length || picks.length > availablePickSlots || busy || uploading) return;
   setReferenceFoods(current => ({ ...current, ...Object.fromEntries(picks.flatMap(({ food, parts }) =>
     [food, ...(parts ?? []).map(part => part.food)].map(entry => [referenceKey(entry), entry]))) }));
   setDraft(previous => {
     const index = replacing ?? previous.items.length - 1;
     const nextKey = Math.max(...previous.items.map(row => row.editor.key)) + 1;
     const firstKey = replacing === null ? nextKey : previous.items[index].editor.key;
     const additions = picks.map(({ item }, offset) => editorItem(
       recipeEdit ? { ...item, originalItemId: previous.items[index].originalItemId } : item,
       offset === 0 ? firstKey : nextKey + offset, undefined, true,
     ));
     return {
       ...previous,
       items: [...previous.items.slice(0, index), ...additions, ...previous.items.slice(index + (replacing === null ? 0 : 1))],
     };
   });
   returnToMeal();
 }

 function manualFromSearch(name: string) {
   if (!name || !canPick) return;
   const key = draft.items[replacing ?? draft.items.length - 1].editor.key;
   const manual = editorItem({ kind: "food", name, quantity: null, unit: null, sourceKind: "unknown", nutrition: emptyNutrition() }, key);
   setDraft(previous => ({
     ...previous,
     items: replacing === null
       ? [...previous.items.slice(0, -1), manual, freeEditorItem(Math.max(...previous.items.map(row => row.editor.key)) + 1)]
       : previous.items.map((row, index) => index === replacing ? manual : row),
   }));
   setFreeKey(key);
   manualFocus.current = key;
   returnToMeal();
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
 const entryIssue=missingReferences?"参考规格未读取，请重新选择该食材。":entered.some(item=>!item.name.trim())?"请填写食物名称。":entered.find(item=>item.editor.calorieIssue)?.editor.calorieIssue??mealWebIssue(input,totals.values),blocked=pending||busy||uploading||aiSaving||invalid||!!entryIssue;
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
   const next={...structuredClone(value),items:[...value.items.map((item,index)=>editorItem(item,index,historicalItems.find(old=>old.id===item.originalItemId)?.nutrition,!!(item.foodId||item.foodRef||item.foodDraft||item.referenceFood))),freeEditorItem(value.items.length)]};
   liveDraft.current=next;setDraft(next);aiOpeningSignature.current=mealDraftSignature(next);return next;
 }
 function openAi(){if(!allowAi||!canMealAi||!onAiSaved)return;aiOpeningSignature.current=mealDraftSignature(liveDraft.current);if(!aiDraftKey)setAiDraftKey(crypto.randomUUID());setResumeTaskId(undefined);setAiError("");setAiOpen(true);}
 function applyAi(value:AppliedMeal){
   if(mealDraftSignature(liveDraft.current)!==aiOpeningSignature.current){setAiError("原草稿已变化，识别结果已保留，请重新核对后再添加。");return;}
   const referenced = value.operation.rows.flatMap(row => row.meal?.meal?.items.flatMap(item => item.referenceSnapshot ? [item.referenceSnapshot.food] : []) ?? []);
   setReferenceFoods(previous => ({ ...previous, ...Object.fromEntries(referenced.map(food => [referenceKey(food), food])) }));
   restoredDraft(value.draft);setAiBinding({taskId:value.taskId,revision:value.operation.revision});setCollapsed([]);setFreeKey(null);setAiOpen(false);setAiWorking(false);
 }
 useLayoutEffect(()=>{const id=new URL(location.href).searchParams.get("aiTask");if(id&&!resumed.current&&allowAi&&canMealAi&&onAiSaved){resumed.current=true;const frame=requestAnimationFrame(()=>{aiOpeningSignature.current=mealDraftSignature(liveDraft.current);setResumeTaskId(id);setAiOpen(true);});return()=>cancelAnimationFrame(frame);}},[allowAi,canMealAi,onAiSaved]);

 const visibleRows = draft.items.map((item, index) => ({ item, index }))
   .filter(({ item }) => !emptyEditorItem(item) || item.editor.key === freeKey);
 const availablePickSlots = 50 - entered.length + (replacing === null ? 0 : 1);
 const canPick = availablePickSlots > 0;
 const mobilePicker = mobile === true && libraryOpen && !aiOpen;
 const hasInspector = useInspectorStep(mobilePicker ? {
   title: recipeEdit || referenceBack ? "食材详情" : "食材库",
   backTo: recipeEdit ? "本餐" : referenceBack?.label ?? "本餐",
   shortBackTo: recipeEdit ? "本餐" : referenceBack?.shortLabel ?? "本餐",
   back: backFromLibrary,
 } : null);
 const externalBack = mobilePicker && hasInspector;

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
     data-entry-form={pending ? "meal-pending" : "meal"} data-library-open={libraryOpen || undefined} data-library-scope={scope}
     aria-busy={busy || pending && !error} onSubmit={submit}
     onKeyDown={event => {
       if (event.key !== "Escape" || !libraryOpen && !referenceBack && replacing === null) return;
       event.preventDefault();
       event.stopPropagation();
       backFromLibrary();
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
               aria-controls={bubbleId + "-picker"} aria-expanded={inlineLibrary || libraryOpen} disabled={!canPick} onClick={() => showLibrary()}>
               从食材库添加 <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
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
                 blank={emptyEditorItem(item)} food={itemFood(item)} reference={itemReference(item)} nutrition={values(item)} nutritionHint={nutritionHint}
                 recipeParts={itemRecipeParts(item)} adjustRecipe={() => showLibrary(index, true)}
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
           id={bubbleId + "-picker"} aria-label="选择食材库" data-reference-scroll={inlineLibrary || undefined}>
           {!externalBack && <div className={styles.libraryTitle}>
             {!inlineLibrary && <button type="button" className={styles.libraryBack} aria-label={recipeEdit ? "返回本餐" : referenceBack ? "返回" + referenceBack.label : replacing !== null ? "取消更换" : "返回本餐"} onClick={backFromLibrary}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>
             </button>}
             <h2 ref={panelTitle} tabIndex={-1}>{recipeEdit || referenceBack ? "食材详情" : "食材库"}</h2>
           </div>}
           {recipeEdit ? <ReferenceDetails food={recipeEdit.food} id={bubbleId + "-recipe-edit"} headingRef={recipeHeading}
             edit={recipeEdit} onAdd={addReference} disabled={!canPick || busy || uploading}
             maxItems={availablePickSlots} back={inlineLibrary ? { label: "← 返回本餐", action: returnToMeal } : undefined}/> : null}
           <div hidden={!!recipeEdit}>
           {replacing !== null && !referenceBack && <div className={styles.replacing} role="status">
             选择食材以替换当前项{inlineLibrary && <button type="button" onClick={returnToMeal}>取消更换</button>}
           </div>}
           <FoodLibraryTabs scope={scope} change={next => { setScope(next); setSelected([]); }}/>
           <div hidden={scope !== "reference"}><ReferenceBrowser query={query} search={setQuery}
             searchRef={scope === "reference" ? search : undefined}
             enabled={!recipeEdit && !pending && scope === "reference" && (inlineLibrary || libraryOpen)} disabled={!canPick || busy || uploading}
             maxItems={availablePickSlots} pickerVisit={libraryVisit} onAdd={addReference} onManual={manualFromSearch} onDetailBack={onDetailBack} externalBack={!inlineLibrary}/></div>
           {scope === "personal" && <><label className={styles.librarySearch + " " + styles.compactField}><span className="sr-only">搜索食材</span>
             <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12 12 4 4"/></svg>
             <input aria-label="搜索食材" ref={search} type="search" placeholder="搜索名称、品牌或规格" value={query}
               onChange={event => setQuery(event.target.value)}/>
           </label>
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
           </div></>}
           </div>
         </section>

       </div>
     </fieldset>

     <footer ref={totalsBar} className={styles.footer} data-meal-footer hidden={libraryOpen && scope === "reference"}>
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
