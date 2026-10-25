"use client";
import { useDraftGuard } from "@/components/draft-guard";
import { RecordDateContext } from "@/components/record-date-context";
import { useId, useRef, useState } from "react";
import { decimal, defaultFoodQuantity, emptyNutrition, foodSpecification, formatNutrition, metricLabels, metrics, portionNutrition, scaled, nutritionFor, sumNutrition, type FoodView, type ItemDraft, type ItemView, type MealDraft } from "./model";
import { PhotoFields } from "./photos";
import styles from "./meals.module.css";
const freeItem = ():ItemDraft=>({kind:"food",name:"",quantity:"1",unit:"份",sourceKind:"estimated",nutritionBasis:"per_portion",perPortionNutrition:emptyNutrition()});
const dragType="application/x-formward-food";
function Cell({value,label,placeholder="—",numeric=false,required=false,change}:{value:string;label:string;placeholder?:string;numeric?:boolean;blank?:boolean;required?:boolean;change:(value:string)=>void}) {
 return <input aria-label={label} placeholder={placeholder} value={value} type={numeric?"number":"text"} min={numeric?"0":undefined} max={numeric?"1000000":undefined} step={numeric?"0.0001":undefined} inputMode={numeric?"decimal":undefined} required={required} maxLength={numeric?undefined:200} onChange={event=>change(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}}}/>;
}
export function MealEditor({ initial, foods, historicalFoods=[], historicalItems=[], foodRefs={}, submitLabel="保存餐次", error, busy, save }: { initial:MealDraft;foods:FoodView[];historicalFoods?:FoodView[];historicalItems?:ItemView[];foodRefs?:Record<string,FoodView>;submitLabel?:string;error:string;busy:boolean;save:(input:MealDraft,allowMissingImages?:boolean)=>Promise<void> }) {
 const [openedOn]=useState(()=>new Date().toLocaleDateString("en-CA"));
 const [draft,setDraft]=useState<MealDraft>(()=>({...structuredClone(initial),items:[...initial.items.map(item=>({...structuredClone(item),kind:"food" as const})),freeItem()]}));
 const [query,setQuery]=useState(""),[category,setCategory]=useState("all"),[step,setStep]=useState<"picker"|"entry">("entry"),[replacing,setReplacing]=useState<number|null>(null),[dragging,setDragging]=useState(false);
 const bubbleId=useId();
 const [uploading,setUploading]=useState(false),[photoError,setPhotoError]=useState(""),table=useRef<HTMLDivElement>(null);
 const draftSignature = JSON.stringify({...draft,items:draft.items.filter(item=>item.name.trim())});
 const [initialSignature] = useState(draftSignature);
 useDraftGuard(draftSignature !== initialSignature, uploading);
 function itemFood(item:ItemDraft){return item.foodRef?foodRefs[item.foodRef]:item.foodId?historicalFoods.find(food=>food.id===item.foodId&&food.version===item.foodVersion)??foods.find(food=>food.id===item.foodId):item.foodDraft??historicalItems.find(previous=>previous.id===item.originalItemId)?.foodSnapshot;}
 function values(item:ItemDraft){const food=itemFood(item);return food?item.quantity&&decimal.safeParse(item.quantity).success&&Number(item.quantity)>0?nutritionFor(food,item.quantity,item.unit??food.unit):emptyNutrition():item.nutritionBasis==="per_portion"?item.quantity&&decimal.safeParse(item.quantity).success&&Number(item.quantity)>0?portionNutrition(item.perPortionNutrition??emptyNutrition(),item.quantity):emptyNutrition():item.nutrition??emptyNutrition();}
 function setItem(index:number,next:ItemDraft){setDraft(previous=>{
 const items=previous.items.map((item,n)=>{
 if(n!==index)return item;
 if(next.quantity!==item.quantity||next.unit!==item.unit)next={...next,reviewExplanation:{...next.reviewExplanation,amount:{source:"user",basis:next.quantity?`填写食用量：${Number(next.quantity)}${next.unit??""}`:"保留未知食用量。"}}};
 if(JSON.stringify(next.perPortionNutrition??next.nutrition)!==JSON.stringify(item.perPortionNutrition??item.nutrition))next={...next,reviewExplanation:{...next.reviewExplanation,nutrition:{source:"user",basis:"手动填写营养数值，口径以本项营养标识为准。"}}};
 return next;
 });
 if(items.at(-1)?.name.trim())items.push(freeItem());
 return {...previous,items};
 });}
 function choose(food:FoodView){
 if(busy||uploading||draft.items.filter(item=>item.name.trim()).length>=50&&replacing===null)return;
 const packaged=!!(food.servingQuantity&&food.servingUnit),quantity=packaged?"1":defaultFoodQuantity(food.unit),next:ItemDraft={kind:"food",name:food.name,foodId:food.id,foodVersion:food.version,quantity,amountDecision:quantity?"provided":undefined,unit:packaged?food.servingUnit:food.unit,sourceKind:food.sourceKind};
 setDraft(previous=>({...previous,items:replacing===null?[...previous.items.slice(0,-1),next,previous.items.at(-1)!]:previous.items.map((item,n)=>n===replacing?next:item)}));
 setReplacing(null);setStep("entry");
 }
 const results=foods.filter(food=>!food.deletedAt&&(category==="all"||(food.category??"ingredient")===category)&&`${food.name} ${food.brand??""} ${food.preparation??""}`.toLowerCase().includes(query.trim().toLowerCase()));
 const entered=draft.items.filter(item=>item.name.trim()),totals=sumNutrition(entered.map(values));

 return <form className={`${styles.form} ${styles.mealForm}`} aria-busy={busy} onSubmit={event=>{event.preventDefault();if(!entered.length)return;void save({...draft,items:entered},true);}}><fieldset disabled={busy||uploading}>
 <RecordDateContext date={draft.date} openedOn={openedOn}/><div className={styles.formColumns}><label>日期<input type="date" required value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value,occurredAt:null})}/></label><label>餐次<input aria-label="餐次" required maxLength={50} list="meal-types" value={draft.mealType} onChange={event=>setDraft({...draft,mealType:event.target.value})}/><datalist id="meal-types">{["早餐","午餐","晚餐","加餐","夜宵"].map(name=><option key={name}>{name}</option>)}</datalist></label></div>
 <p className={styles.hint}>选择食材库，或直接填写食物。自由项填写每份营养，份数可填 0.5、1.5 等小数。</p>
 <div className={styles.entryPaths}><button type="button" aria-pressed={step==="picker"} onClick={()=>setStep("picker")}>选择食材库</button><button type="button" aria-pressed={step==="entry"} onClick={()=>setStep("entry")}>本餐 {entered.length} 项 →</button></div>
 <div className={styles.mealColumns} data-step={step}>
 <section className={styles.foodPicker} aria-label="选择食材库"><h3>食材库</h3><label>搜索食材<input type="search" placeholder="名称、品牌或规格" value={query} onChange={event=>setQuery(event.target.value)}/></label>
 <div className={styles.categoryTabs}>{[["all","全部"],["meal","整餐"],["ingredient","食材"]].map(([key,label])=><button type="button" key={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>{label}</button>)}</div>
 {replacing!==null&&<p className={styles.hint}>选择后替换当前食材。<button type="button" onClick={()=>{setReplacing(null);setStep("entry");}}>取消更换</button></p>}
 <div className={styles.pickerResults}>{results.map(food=><button type="button" draggable key={food.id} aria-label={`选择 ${food.name}`} onDragStart={event=>{event.dataTransfer.setData(dragType,JSON.stringify({id:food.id,version:food.version}));event.dataTransfer.effectAllowed="copy";}} onClick={()=>choose(food)}><span><strong>{food.name}</strong><small>{[food.brand,foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</small><small>{food.servingQuantity&&food.servingUnit?<>{1}{food.servingUnit} = {Number(food.servingQuantity)}{food.unit} · {formatNutrition(nutritionFor(food,"1",food.servingUnit).caloriesKcal,"caloriesKcal")}</>:<>每 {Number(food.baseQuantity)}{food.unit} · {formatNutrition(food.nutrition.caloriesKcal,"caloriesKcal")}</>} kcal</small></span><span aria-hidden="true">＋</span></button>)}{!results.length&&<p className={styles.hint}>没有匹配的食材，可以自由填写本次摄入。</p>}</div></section>
 <section className={styles.mealEntry} aria-label="本餐录入">
 <div className={styles.mealTotal} aria-label="本餐合计"><h3>本餐合计 <small>{entered.length} 项</small></h3><div className={styles.compactMetrics}>{metrics.map(metric=><div key={metric}><span>{metricLabels[metric]}</span><strong>{formatNutrition(totals.values[metric],metric)}<small>{metric==="caloriesKcal"?"kcal":"g"}</small></strong>{totals.incomplete[metric]&&<small>部分</small>}</div>)}</div></div>
 <div ref={table} className={styles.mealSheet} data-dragging={dragging} onDragOver={event=>{if(event.dataTransfer.types.includes(dragType)){event.preventDefault();event.dataTransfer.dropEffect="copy";setDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);try{const payload=JSON.parse(event.dataTransfer.getData(dragType)),food=foods.find(food=>food.id===payload.id&&food.version===payload.version&&!food.deletedAt);if(food)choose(food);}catch{}}}>
 <table className={styles.entryTable} aria-label="本餐食物表"><thead><tr><th>食物</th><th>份数／数量</th><th>kcal</th><th>P · g</th><th>C · g</th><th>F · g</th><th>操作</th></tr></thead><tbody>
 {draft.items.map((item,index)=>{
 const food=itemFood(item),nutrition=values(item),blank=index===draft.items.length-1,perPortion=item.nutritionBasis==="per_portion",raw=perPortion?item.perPortionNutrition??emptyNutrition():item.nutrition??emptyNutrition(),popup=bubbleId+"-"+index;
 return <tr key={index} data-blank-row={blank} data-nutrition-basis={food?"food_library":perPortion?"per_portion":"consumed_total"}>
 <td className={styles.entryName}>{food?<><strong>{food.name}</strong><small>{food.servingQuantity&&food.servingUnit?"1"+food.servingUnit+" = "+Number(food.servingQuantity)+food.unit:"每 "+Number(food.baseQuantity)+food.unit}</small></>:<><Cell label={blank?"自由填写食物名称":"食物名称 "+(index+1)} value={item.name} placeholder="食物名称" change={name=>setItem(index,{...item,name})}/><small>{perPortion?"每份营养":"原记录 · 本次总量"}</small></>}</td>
 <td className={styles.entryQuantity}><span className={styles.quantityLabel}>{food?"数量":"份数"}</span>{food?food.servingQuantity&&food.servingUnit?<select aria-label={"单位 "+(index+1)} value={item.unit??food.unit} onChange={event=>{
  const unit=event.target.value,q=item.quantity?unit===food.unit?scaled(item.quantity,food.servingQuantity!,"1"):scaled(item.quantity,"1",food.servingQuantity!):null;
  setItem(index,{...item,unit,quantity:q});
 }}><option value={food.servingUnit}>{food.servingUnit}</option><option value={food.unit}>{food.unit}</option></select>:<small>{food.unit}</small>:<input aria-label={"单位 "+(index+1)} list="meal-portion-units" maxLength={30} placeholder="份" value={item.unit??""} onChange={event=>setItem(index,{...item,unit:event.target.value||null})}/>}
 <Cell label={food?"食用量（"+(item.unit??food.unit)+"）":"份数 "+(index+1)} value={item.quantity??""} numeric required={!food&&perPortion} placeholder="数量" change={quantity=>setItem(index,{...item,quantity:quantity||null,amountDecision:quantity?"provided":undefined})}/></td>
 {metrics.map(metric=><td data-nutrient={metric} key={metric} data-label={metric==="caloriesKcal"?"kcal":metric==="proteinG"?"P":metric==="carbsG"?"C":"F"}>{food?<span className={styles.calculated}>{formatNutrition(nutrition[metric],metric)}</span>:<Cell label={(perPortion?"每份":"本次")+metricLabels[metric]+" "+(index+1)} numeric value={raw[metric]===null?"":String(Number(raw[metric]))} change={value=>setItem(index,{...item,...(perPortion?{perPortionNutrition:{...raw,[metric]:value||null}}:{nutrition:{...raw,[metric]:value||null}})})}/>}</td>)}
 <td className={styles.entryActions}>{!blank&&<><button type="button" popoverTarget={popup} aria-label={(item.name||"食物")+"详情"}>详情</button><button type="button" aria-label={"移除 "+(item.name||"食物")} onClick={()=>{setDraft(previous=>({...previous,items:previous.items.filter((_,n)=>n!==index)}));setReplacing(null);}}>×</button>
 <div popover="auto" id={popup} className={styles.nutritionBubble}><h3>{item.name} · 营养依据</h3>{food?<><p>{food.basis??"食材库已保存的营养规格"}</p><button type="button" onClick={event=>{event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();setReplacing(index);setStep("picker");}}>更换食材</button>{!item.quantity&&<label className={styles.checkbox}><input type="checkbox" checked={item.amountDecision==="unknown_accepted"} onChange={event=>setItem(index,{...item,amountDecision:event.target.checked?"unknown_accepted":undefined})}/>保留未知数量</label>}</>:<><label>营养依据<select aria-label={"营养依据 "+(index+1)} value={["label","composition_table"].includes(item.sourceKind)?"reference":item.sourceKind} onChange={event=>setItem(index,{...item,sourceKind:event.target.value as ItemDraft["sourceKind"]})}><option value="reference">标签／成分表</option><option value="estimated">直接预估</option>{item.sourceKind==="unknown"&&<option value="unknown">未知（原记录）</option>}</select></label>{!perPortion&&<><p>原记录的营养是本次总量，改份数不会再次相乘。</p><button type="button" onClick={()=>{const quantity=item.quantity&&Number(item.quantity)>0?item.quantity:"1",base=Object.fromEntries(metrics.map(metric=>[metric,raw[metric]===null?null:scaled(raw[metric]!,"1",quantity)])) as typeof raw;const {nutrition,...rest}=item;void nutrition;setItem(index,{...rest,quantity,nutritionBasis:"per_portion",perPortionNutrition:base});}}>改为每份营养</button></>}</>}
 </div></>}</td>
 </tr>;
 })}</tbody></table><datalist id="meal-portion-units">{["份","个","只","碗","杯","包","勺"].map(unit=><option key={unit} value={unit}/>)}</datalist></div>
        <label>餐次备注<textarea aria-label="餐次备注" rows={3} maxLength={12000} value={draft.notes??""} placeholder="补充食物、份量或做法" onChange={event=>setDraft({...draft,notes:event.target.value||null})}/></label>
        <PhotoFields expectedCount={draft.expectedImageCount} onExpected={expectedImageCount=>setDraft(previous=>({...previous,expectedImageCount}))} ids={draft.imageIds??[]} change={imageIds=>setDraft(previous=>({...previous,imageIds}))} busy={busy} onBusy={setUploading} onError={setPhotoError}/>
        {(error.includes("相同")||draft.allowDuplicate)&&<label className={styles.checkbox}><input type="checkbox" checked={Boolean(draft.allowDuplicate)} onChange={event=>setDraft({...draft,allowDuplicate:event.target.checked})}/>这是另一次进食，仍然新增</label>}
        {(draft.expectedImageCount??0)>(draft.imageIds?.length??0)&&<p className={styles.hint}>照片未齐，可直接保存文字，之后补传。</p>}
        {photoError&&<p className={styles.hint}>{photoError} 可先保存文字。</p>}{error&&<p className={styles.error} role="alert">{error}</p>}<button disabled={!entered.length||uploading} className={styles.save} type="submit">{busy?"正在处理…":submitLabel==="更新预览"?submitLabel:submitLabel+" · "+draft.date}</button>
      </section>
    </div>
  </fieldset></form>;
}
