import {calendarOrdinal} from "../measurements/calendar";
import {mealDraftSchema,mealTypeLabel,metrics,type MealDraft,type Nutrition} from "../meals/model";
import {energyActionSchema,energyModes,type EnergyAction,type EnergyDayRecord} from "../activities/model";

const number=(value:unknown)=>value==null||value===""?null:Number(value);
export const hasPositiveReading=(values:unknown[])=>values.some(value=>value!=null&&value!==""&&Number.isFinite(Number(value))&&Number(value)>0);

/** 数量、项目和口径必须相同；来源和备注不属于数值。用于网页零值旧记录的保留判断。 */
export function sameMealAmounts(a:MealDraft,b:MealDraft){
 const key=(meal:MealDraft)=>JSON.stringify([meal.date,mealTypeLabel(meal.mealType),meal.items.map(item=>{
  const identified=item as typeof item&{id?:string};
  return [identified.id??item.originalItemId??null,item.name,item.unit??null,number(item.quantity),item.foodId??null,item.foodVersion??null,item.foodRef??null,item.foodDraft??null,item.nutritionBasis??"consumed_total",metrics.map(k=>number(item.nutrition?.[k])),metrics.map(k=>number(item.perPortionNutrition?.[k]))];
 })]);
 return key(a)===key(b);
}
export function mealWebIssue(input:MealDraft,values:Nutrition,unchanged=false):string|null{
 const {kind,...clean}=input as MealDraft&{kind?:unknown};void kind;
 if(!input.items.length)return "先添加食物，填写已知营养后即可保存。";
 if(!input.mealType.trim())return "请填写餐次。";
 if(input.items.some(item=>!item.name.trim()))return "请填写食物名称。";
 if(!mealDraftSchema.safeParse(clean).success)return "请检查食物数量、营养数值或照片数量。";
 try{calendarOrdinal(input.date);}catch{return "请选择有效日期。";}
 return hasPositiveReading(metrics.map(k=>values[k]))||unchanged?null:"请填写至少一项大于0的已知营养数值。";
}
type DayAmounts=Pick<EnergyDayRecord,"date"|"entryMode"|"activityMode"|"restingKcal"|"activeKcal"|"totalKcal">;
export function sameEnergyAmounts(a:DayAmounts,b:DayAmounts){
 const key=(day:DayAmounts)=>JSON.stringify([day.date,energyModes(day),number(day.restingKcal),number(day.activeKcal),number(day.totalKcal)]);
 return key(a)===key(b);
}
export function adoptedEnergyAction(action:Extract<EnergyAction,{kind:"save_energy_day"}>){
 const modes=energyModes({entryMode:action.entryMode,activityMode:action.activityMode,activeKcal:action.activeKcal??null,totalKcal:action.totalKcal??null});
 const {restingKcal,activeKcal,totalKcal,...base}=action;
 return modes.entryMode==="total"?{...base,...modes,totalKcal:totalKcal??null}:{...base,...modes,restingKcal:restingKcal??null,...(modes.activityMode==="total"?{activeKcal:activeKcal??null}:{})};
}
export function energyWebIssue(action:EnergyAction,active:string|null|undefined,unchanged=false):string|null{
 if(action.kind!=="save_energy_day")return null;
 if(!energyActionSchema.safeParse(adoptedEnergyAction(action)).success)return "请检查日期和热量数值。";
 const modes=energyModes({entryMode:action.entryMode,activityMode:action.activityMode,activeKcal:action.activeKcal??null,totalKcal:action.totalKcal??null});
 const values=modes.entryMode==="total"?[action.totalKcal]:[action.restingKcal,modes.activityMode==="total"?action.activeKcal:active];
 return hasPositiveReading(values)||unchanged?null:"请填写至少一项大于0的已知消耗数值。";
}
