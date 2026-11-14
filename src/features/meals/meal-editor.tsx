"use client";
import {DateField} from "@/components/date-field";
import {LocalLoading} from "@/components/local-loading";
import {mealWebIssue} from "../records/web-entry";
import {DecimalInput} from "@/components/decimal-input";
import { useDraftGuard } from "@/components/draft-guard";
import { mealContentKey, mealTypeLabel } from "./model";
import { MealDuplicateNotice } from "./meal-duplicate-notice";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { decimal, defaultFoodQuantity, emptyNutrition, foodSpecification, formatNutrition, metricLabels, metrics, scaled, nutritionFor, sumNutrition, type FoodView, type ItemDraft, type ItemView, type MealView,type MealDraft } from "./model";
import {editorDecimal,editorItem,freeEditorItem,mealEditorInput,mealDraftSignature,emptyEditorItem,updateEditorNutrition,type EditorItem,type EditorMeal} from "./meal-editor-state";
import { PhotoFields } from "./photos";
import {MealItemDetails} from "./meal-item-details";
import {useMealLayout} from "./use-meal-layout";
import styles from "./meals.module.css";
const dragType="application/x-formward-food";
function Cell({value,label,placeholder="—",numeric=false,integer=false,precision=2,required=false,description,change}:{value:string;label:string;placeholder?:string;numeric?:boolean;integer?:boolean;precision?:1|2;blank?:boolean;required?:boolean;description?:string;change:(value:string)=>void}) {
 const common={"aria-label":label,"aria-describedby":description,placeholder,required,onKeyDown:(event:React.KeyboardEvent<HTMLInputElement>)=>{if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}}};
 return numeric?<DecimalInput precision={integer?0:precision} {...common} min={0} max={1000000} value={value} onValue={change}/>:<input {...common} value={value} maxLength={200} onChange={event=>change(event.target.value)}/>;
}
export function MealEditor({ initial, foods, historicalFoods=[], historicalItems=[], foodRefs={}, recentMeals=[], submitLabel="保存餐次", error, busy, save, pending=false }: { pending?:boolean;initial:MealDraft;foods:FoodView[];historicalFoods?:FoodView[];historicalItems?:ItemView[];foodRefs?:Record<string,FoodView>;recentMeals?:MealView[];submitLabel?:string;error:string;busy:boolean;save:(input:MealDraft,allowMissingImages?:boolean)=>Promise<void> }) {
 const totalsBar=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{const node=totalsBar.current,dialog=node?.closest('dialog');if(!node||!dialog)return;const measure=()=>dialog.style.setProperty("--entry-footer-height",node.getBoundingClientRect().height+"px");measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>{observer.disconnect();dialog.style.removeProperty("--entry-footer-height");};},[]);
 const submitting=useRef(false),[invalid,setInvalid]=useState(false);
 const search=useRef<HTMLInputElement>(null);
 const [draft,setDraft]=useState<EditorMeal>(()=>({...structuredClone(initial),mealType:mealTypeLabel(initial.mealType),items:[...initial.items.map((item,index)=>{
  const saved=item.originalItemId?historicalItems.find(previous=>previous.id===item.originalItemId):historicalItems[index];
  return editorItem(item,index,saved?.nutrition,!!(item.foodId||item.foodRef||item.foodDraft||saved?.foodSnapshot));
 }),freeEditorItem(initial.items.length)]}));
 const [freeKey,setFreeKey]=useState<number|null>(initial.items.length);
 const [query,setQuery]=useState(""),[category,setCategory]=useState("all"),[step,setStep]=useState<"picker"|"entry">("entry"),[replacing,setReplacing]=useState<number|null>(null),[dragging,setDragging]=useState(false);
 const bubbleId=useId(),nutritionHint=bubbleId+"-nutrition";
 const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState(""),table=useRef<HTMLDivElement>(null);
 const draftSignature = mealDraftSignature(draft);
 const [initialSignature] = useState(draftSignature);
 useDraftGuard(draftSignature !== initialSignature, uploading);
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
 function choose(food:FoodView){
 if(busy||uploading||draft.items.filter(item=>item.name.trim()).length>=50&&replacing===null)return;
 const packaged=!!(food.servingQuantity&&food.servingUnit),quantity=packaged?"1":defaultFoodQuantity(food.unit),next:ItemDraft={kind:"food",name:food.name,foodId:food.id,foodVersion:food.version,quantity,amountDecision:quantity?"provided":undefined,unit:packaged?food.servingUnit:food.unit,sourceKind:food.sourceKind};
 setDraft(previous=>({...previous,items:replacing===null?[...previous.items.slice(0,-1),editorItem(next,Math.max(...previous.items.map(item=>item.editor.key))+1,undefined,true),previous.items.at(-1)!]:previous.items.map((item,n)=>n===replacing?editorItem(next,item.editor.key,undefined,true):item)}));
 setReplacing(null);setFreeKey(null);setStep("entry");
 }
 const results=foods.filter(food=>!food.deletedAt&&(category==="all"||(food.category??"ingredient")===category)&&`${food.name} ${food.brand??""} ${food.preparation??""}`.toLowerCase().includes(query.trim().toLowerCase()));
 const entered=draft.items.filter(item=>!emptyEditorItem(item)),totals=sumNutrition(entered.map(values));
 const input=mealEditorInput(draft);
 const entryIssue=entered.some(item=>!item.name.trim())?"请填写食物名称。":entered.find(item=>item.editor.calorieIssue)?.editor.calorieIssue??mealWebIssue(input,totals.values),blocked=pending||busy||uploading||invalid||!!entryIssue;
 const contentKey=mealContentKey({...input,items:input.items.map((item,index)=>({...item,name:itemFood(entered[index])?.name??item.name,nutrition:values(entered[index])}))});
 const duplicate=!entryIssue&&recentMeals.some(meal=>!meal.deletedAt&&meal.id!==draft.id&&mealContentKey(meal)===contentKey);
 const extra=useRef<HTMLDetailsElement>(null);
 const layout=useMealLayout(table,draft.items.map(item=>[item.unit??"",item.quantity??"",...metrics.map(metric=>{const value=values(item)[metric];return itemFood(item)?formatNutrition(value,metric):value??"";})]));

 function openFree(){
  setReplacing(null);setStep("entry");setFreeKey(draft.items.at(-1)!.editor.key);
  requestAnimationFrame(()=>table.current?.querySelector<HTMLInputElement>('[data-blank-row="true"] input')?.focus());
 }
 function openPicker(){setStep("picker");requestAnimationFrame(()=>search.current?.focus());}

 return <form data-entry-form={pending?"meal-pending":"meal"} className={`${styles.form} ${styles.mealForm}`} data-picker={layout.picker} aria-busy={busy||pending} onChange={event=>setInvalid(Boolean(event.currentTarget.querySelector(":invalid")))} onSubmit={async event=>{event.preventDefault();if(blocked||submitting.current)return;submitting.current=true;try{await save(mealEditorInput(draft),true);}finally{submitting.current=false;}}}>
 <fieldset disabled={busy||uploading||pending}>
 <div className={styles.formColumns}><label>日期<DateField aria-label="日期" required value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value,occurredAt:null})}/></label><label>餐次<input aria-label="餐次" required maxLength={50} list="meal-types" value={draft.mealType} onChange={event=>setDraft({...draft,mealType:event.target.value})}/><datalist id="meal-types">{["早餐","午餐","晚餐","加餐","夜宵"].map(name=><option key={name}>{name}</option>)}</datalist></label></div>
 {duplicate&&<MealDuplicateNotice date={draft.date}/>}
 <div className={styles.entryHeading}><h3 className={styles.entryTitle}>本餐食物 <small>{entered.length} 项</small></h3><div data-record-guide-fields className={styles.entryPaths} aria-label="添加食物方式"><button type="button" aria-pressed={step==="entry"} onClick={openFree}>自己填写</button><button type="button" aria-pressed={step==="picker"} onClick={openPicker}>从食材库添加</button></div></div>
 <div className={styles.mealColumns} data-step={step}>
 <section className={styles.foodPicker} aria-label="选择食材库"><div className={styles.pickerHeading}><h3>食材库</h3><button type="button" onClick={()=>{setReplacing(null);setStep("entry");}}>返回本餐 · {entered.length}项</button></div><label>搜索食材<input ref={search} type="search" placeholder="名称、品牌或规格" value={query} onChange={event=>setQuery(event.target.value)}/></label>
 <div className={styles.categoryTabs}>{[["all","全部"],["meal","整餐"],["ingredient","食材"]].map(([key,label])=><button type="button" key={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>{label}</button>)}</div>
 {replacing!==null&&<p className={styles.hint}>选择后替换当前食材。<button type="button" onClick={()=>{setReplacing(null);setStep("entry");}}>取消更换</button></p>}
 <div className={styles.pickerResults}>{pending&&<LocalLoading label="正在读取食材库…"/>} {!pending&&results.map(food=><button type="button" draggable key={food.id} aria-label={`添加 ${food.name}`} onDragStart={event=>{event.dataTransfer.setData(dragType,JSON.stringify({id:food.id,version:food.version}));event.dataTransfer.effectAllowed="copy";}} onClick={()=>choose(food)}><span><strong>{food.name}</strong><small>{[food.brand,foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</small><small>{food.servingQuantity&&food.servingUnit?<>{1}{food.servingUnit} = {Number(food.servingQuantity)}{food.unit} · {formatNutrition(nutritionFor(food,"1",food.servingUnit).caloriesKcal,"caloriesKcal")}</>:<>每 {Number(food.baseQuantity)}{food.unit} · {formatNutrition(food.nutrition.caloriesKcal,"caloriesKcal")}</>} kcal</small></span><span className={styles.pickerAdd} aria-hidden="true">添加</span></button>)}{!pending&&!results.length&&<p className={styles.hint}>没有匹配的食材，可以自由填写本次摄入。</p>}</div></section>
 <section className={styles.mealEntry} aria-label="本餐录入">
 <div ref={table} className={styles.mealSheet} data-dragging={dragging} onDragOver={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();event.dataTransfer.dropEffect="copy";setDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);try{const payload=JSON.parse(event.dataTransfer.getData(dragType)),food=foods.find(food=>food.id===payload.id&&food.version===payload.version&&!food.deletedAt);if(food)choose(food);}catch{}}}>
 <table className={styles.entryTable} data-layout={layout.mode} data-stack-fields={layout.stack} data-nutrient-columns={layout.nutrientColumns} style={layout.variables} aria-label="本餐食物表"><colgroup><col/>{layout.widths.map((_,index)=><col key={index} style={{width:"var(--entry-col-"+index+")"}}/>)}<col style={{width:120}}/></colgroup><thead><tr><th>食物</th><th>单位</th><th>数量</th><th>kcal</th><th>P · g</th><th>C · g</th><th>F · g</th><th>操作</th></tr></thead><tbody>
 {draft.items.map((item,index)=>{
 const food=itemFood(item),nutrition=values(item),blank=index===draft.items.length-1&&emptyEditorItem(item),raw=item.nutrition??emptyNutrition(),popup=bubbleId+"-"+item.editor.key;
 if(blank&&freeKey!==item.editor.key)return null;
 return <tr key={item.editor.key} data-blank-row={blank} data-nutrition-basis={food?"food_library":"consumed_total"}>
 <td className={styles.entryName}>{food?<strong>{food.name}</strong>:<Cell label={blank?"自由填写食物名称":"食物名称 "+(index+1)} value={item.name} placeholder="食物名称" change={name=>setItem(index,{...item,name})}/>}{!emptyEditorItem(item)&&!item.name.trim()&&<small className={styles.error} role="status">请填写食物名称</small>}</td>
 <td className={styles.entryUnit} data-label="单位">{food?food.servingQuantity&&food.servingUnit?<select aria-label={"单位 "+(index+1)} value={item.unit??food.unit} onChange={event=>{
  const unit=event.target.value,q=item.quantity?unit===food.unit?scaled(item.quantity,food.servingQuantity!,"1"):scaled(item.quantity,"1",food.servingQuantity!):null;
  setItem(index,{...item,unit,quantity:q?editorDecimal(q):null});
 }}><option value={food.servingUnit}>{food.servingUnit}</option><option value={food.unit}>{food.unit}</option></select> :<input aria-label={"单位 "+(index+1)} value={food.unit} readOnly/>:<input aria-label={"单位 "+(index+1)} list="meal-portion-units" maxLength={30} placeholder="单位" value={item.unit??""} onChange={event=>setItem(index,{...item,unit:event.target.value||null})}/>}
 </td><td className={styles.entryQuantity} data-label="数量"><Cell label={"数量 "+(index+1)} description={!food?nutritionHint:undefined} value={item.quantity??""} numeric placeholder="数量" change={quantity=>setItem(index,{...item,quantity:quantity||null,amountDecision:quantity?"provided":undefined})}/></td>
 {metrics.map(metric=><td data-nutrient={metric} key={metric} data-label={metric==="caloriesKcal"?"kcal":metricLabels[metric]+" g"}>{food?<span className={styles.calculated}>{formatNutrition(nutrition[metric],metric)}</span>:<Cell label={"本次"+metricLabels[metric]+" "+(index+1)} description={nutritionHint} numeric precision={1} integer={metric==="caloriesKcal"} value={raw[metric]??""} change={value=>setItem(index,updateEditorNutrition(item,metric,value))}/>}</td>)}
 <td className={styles.entryActions}>{!blank&&<><MealItemDetails id={popup} name={item.name||"食物"}><h3>{item.name} · 营养依据</h3>{food?<><p>{food.servingQuantity&&food.servingUnit?"1"+food.servingUnit+" = "+Number(food.servingQuantity)+food.unit:"每 "+Number(food.baseQuantity)+food.unit}</p><p>{food.basis??"食材库已保存的营养规格"}</p><button type="button" onClick={event=>{event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();setReplacing(index);setStep("picker");}}>更换食材</button>{!item.quantity&&<label className={styles.checkbox}><input type="checkbox" checked={item.amountDecision==="unknown_accepted"} onChange={event=>setItem(index,{...item,amountDecision:event.target.checked?"unknown_accepted":undefined})}/>保留未知数量</label>}</>:<><label>营养依据<select aria-label={"营养依据 "+(index+1)} value={["label","composition_table"].includes(item.sourceKind)?"reference":item.sourceKind} onChange={event=>setItem(index,{...item,sourceKind:event.target.value as ItemDraft["sourceKind"]})}><option value="reference">标签／成分表</option><option value="estimated">直接预估</option>{item.sourceKind==="unknown"&&<option value="unknown">未知（原记录）</option>}</select></label></>}
 </MealItemDetails><button type="button" aria-label={"移除 "+(item.name||"食物")} onClick={()=>{setDraft(previous=>({...previous,items:previous.items.filter((_,n)=>n!==index)}));setReplacing(null);}}>×</button></>}</td>
 </tr>;
 })}</tbody></table><datalist id="meal-portion-units">{["g","mL","份","个","只","碗","杯","包","勺"].map(unit=><option key={unit} value={unit}/>)}</datalist></div><button className={styles.addFood} type="button" onClick={openFree}>＋ 添加食物</button><p id={nutritionHint} className={styles.entryHint}>填写本次总营养；三项填全后按4／4／9计算热量，也可手填。食材库按份量换算。</p>
        <details ref={extra} className={styles.mealExtra}><summary>备注与照片{draft.notes?" · 有备注":""}{draft.imageIds?.length?" · "+draft.imageIds.length+"张照片":""}{uploading?" · 正在上传…":""}</summary><label>餐次备注<textarea aria-label="餐次备注" rows={3} maxLength={12000} value={draft.notes??""} placeholder="补充食物、份量或做法" onChange={event=>setDraft({...draft,notes:event.target.value||null})}/></label>
        <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(previous=>({...previous,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(previous=>({...previous,imageIds}))} busy={busy} onBusy={setUploading} onError={message=>{setPhotoError(message);if(message&&extra.current)extra.current.open=true;}}/></details>
        {(error.includes("相同")||draft.allowDuplicate)&&<label className={styles.checkbox}><input type="checkbox" checked={Boolean(draft.allowDuplicate)} onChange={event=>setDraft({...draft,allowDuplicate:event.target.checked})}/>这是另一次进食，仍然新增</label>}
        {(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<p className={styles.hint}>照片未齐，可直接保存文字，之后补传。</p>}
        {photoError&&<p className={styles.hint}>{photoError} 可先保存文字。</p>}
      </section>
    </div>
  </fieldset> <footer ref={totalsBar} className={styles.stickyMealTotal} aria-label="本餐合计与保存"><div><div className={styles.headerNutrition} aria-label="本餐合计"><strong>{formatNutrition(totals.values.caloriesKcal,"caloriesKcal")}<small>kcal</small></strong><span className={styles.headerMacros}>{totals.incomplete.caloriesKcal&&totals.values.caloriesKcal!==null&&<span>已知部分</span>}{metrics.filter(metric=>metric!=="caloriesKcal").map(metric=><span key={metric}>{metricLabels[metric]} {formatNutrition(totals.values[metric],metric)}{"\u00a0g"}</span>)}</span></div>{(pending||entryIssue)&&<p className={styles.entryIssue} role="status">{pending?"正在读取录入所需数据…":entryIssue}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}</div><button data-record-guide-save aria-label={submitLabel+" · "+draft.date} disabled={blocked} className={styles.save} type="submit">{busy?"正在处理…":submitLabel}</button></footer></form>;
}
