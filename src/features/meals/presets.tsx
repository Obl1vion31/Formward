"use client";
import recordUI from "@/components/record-ui.module.css";
import {Fragment,useId,useState,type DragEventHandler,type ReactNode} from "react";
import { foodSpecification, formatNutrition, sourceLabels, type FoodDraft, type FoodView, type Metric } from "./model";
import { ImageGallery } from "./photos";
import styles from "./meals.module.css";
import picker from "./meal-editor.module.css";
import { MealItemDetails } from "./meal-item-details";
import { editorUnit, MealEntryReadings, MealInfoIcon } from "./meal-entry-readings";
const columns: Metric[] = ["proteinG", "carbsG", "fatG", "caloriesKcal"];
export function FoodTable<T extends FoodDraft&{id?:string}>({ foods, actions }: { foods: T[]; actions: (food: T) => ReactNode }) {
  const [expanded,setExpanded]=useState<string|number|null>(null),prefix=useId();
  return <div className={styles.foodTableViewport}><table className={styles.foodTable}><thead><tr><th scope="col">食材／规格</th><th scope="col">营养基准</th><th scope="col">蛋白质（g）</th><th scope="col">碳水（g）</th><th scope="col">脂肪（g）</th><th scope="col">热量（千卡）</th><th scope="col">操作</th></tr></thead><tbody>
    {foods.map((f,index)=>{const key=f.id??index,open=expanded===key,id=prefix+"-"+index;return <Fragment key={key}><tr><th scope="row" className={styles.rowName}><strong>{f.name}</strong><span>{[f.brand,foodSpecification(f.preparation)].filter(Boolean).join(" · ")}</span></th><td className={styles.rowAmount}>每 {Number(f.baseQuantity)}{f.unit}</td>{columns.map(m=><td key={m} className={m==="caloriesKcal"?styles.rowEnergy:styles.rowMacro} data-label={{proteinG:"蛋白质 g",carbsG:"碳水 g",fatG:"脂肪 g",caloriesKcal:"热量 千卡"}[m]}>{formatNutrition(f.nutrition[m],m)}<small className={styles.mobileUnit}>{m==="caloriesKcal"?" 千卡":"g"}</small></td>)}<td className={styles.rowActions}><div className={styles.actions}><span className={styles.foodInlineActions}>{actions(f)}</span><button type="button" className={recordUI.secondary+" "+styles.foodDetailsToggle} data-record-action="view" aria-label={`${f.name}详情`} aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(open?null:key)}>详情<DetailsChevron open={open}/></button></div></td></tr>{open&&<tr className={styles.foodExpanded} id={id}><td colSpan={7}><FoodDetails food={f} compact/></td></tr>}</Fragment>;})}
  </tbody></table></div>;
}
export function FoodDetails({ food,compact=false }: { food: FoodDraft;compact?:boolean }) {
  if(compact)return <section className={styles.foodInformation} aria-label={food.name+"的来源与说明"}><p>{sourceLabels[food.sourceKind]}{food.servingQuantity&&food.servingUnit&&<> · 1{food.servingUnit} = {Number(food.servingQuantity)}{food.unit}</>}</p>{food.basis&&<p>{food.basis}</p>}{food.evidenceUrl&&<a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}<ImageGallery ids={food.imageIds}/></section>;
  return <section className={styles.foodDetails}><h3>{food.name}</h3><p className={styles.notes}>{[food.brand,foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</p><p>每 {Number(food.baseQuantity)}{food.unit} · {sourceLabels[food.sourceKind]}{food.servingQuantity&&food.servingUnit&&<> · 1{food.servingUnit} = {Number(food.servingQuantity)}{food.unit}</>}</p><dl className={styles.foodNutrients}>{(["caloriesKcal","proteinG","carbsG","fatG"] as const).map(metric=><div key={metric}><dt>{{caloriesKcal:"热量",proteinG:"蛋白质",carbsG:"碳水",fatG:"脂肪"}[metric]}</dt><dd>{formatNutrition(food.nutrition[metric],metric)}<small>{metric==="caloriesKcal"?"kcal":"g"}</small></dd></div>)}</dl>{food.basis&&<div className={styles.foodAnalysis}><h4>{food.sourceKind==="estimated"?"估算分析":"数据来源"}</h4><p className={styles.notes}>{food.basis}</p></div>}{food.evidenceUrl&&<a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}<ImageGallery ids={food.imageIds}/></section>;
}

function DetailsChevron({open=false}:{open?:boolean}){return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{transform:open?"rotate(180deg)":undefined}}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;}

export function FoodPickerCard({
  food, chosen, choose, toggle, replacing, disabled, onDragStart,
}: {
  food: FoodView;
  chosen: boolean;
  choose: () => void;
  toggle: () => void;
  replacing: boolean;
  disabled: boolean;
  onDragStart: DragEventHandler<HTMLDivElement>;
}) {
  const id = useId();
  const base = "每 " + Number(food.baseQuantity) + " " + editorUnit(food.unit);
  const calories = food.nutrition.caloriesKcal;
  const selectionLabel = (replacing ? "替换为 " : "选择 ") + food.name;

  return <div className={picker.pickerRow} data-picked={chosen || undefined} draggable={!disabled} onDragStart={onDragStart}>
    <label className={picker.pickerChoice}>
      <input className={picker.pickerCheck} type="checkbox" disabled={disabled}
        checked={chosen} aria-label={selectionLabel} onChange={replacing ? choose : toggle} />
      <span className={picker.pickerSummary}>
        <strong>{food.name}</strong>
        <small>{calories === null ? "热量未知" : formatNutrition(calories, "caloriesKcal") + " 千卡"}<span> · {base}</span></small>
      </span>
    </label>
    <MealItemDetails id={id} label={food.name + "规格与营养"} trigger={<MealInfoIcon/>} className={picker.iconButton}>
      <h3>{food.name}</h3>
      <p>{base}</p>
      {(food.brand || food.preparation) && <p>{[food.brand, foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</p>}
      <MealEntryReadings nutrition={food.nutrition}/>
    </MealItemDetails>
    <button type="button" className={picker.pickerAdd} disabled={disabled}
      aria-label={(replacing ? "替换为 " : "添加 ") + food.name} onClick={choose}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg>
    </button>
  </div>;
}
