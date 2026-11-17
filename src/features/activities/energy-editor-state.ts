import {numericDraftValue} from "../../components/form-draft";
import type {EnergyAction} from "./model";
type Exercise={id?:string;name:string;calorieMode?:string;caloriesKcal?:string|null;exerciseActiveKcal?:string|null;exerciseRestingKcal?:string|null;durationMinutes?:string|null;sourceSystem?:string|null;timezone?:string|null;completed?:boolean;inclusion?:string|null};
export const exerciseHasInput=(item:Exercise)=>!!item.id||!!item.name.trim()||!!item.sourceSystem?.trim()||[item.caloriesKcal,item.exerciseActiveKcal,item.exerciseRestingKcal,item.durationMinutes].some(v=>v!=null&&v!=="");
export function energyDraftSignature(draft:EnergyAction,items:Exercise[]){
 const numbers=["restingKcal","activeKcal","totalKcal","steps","caloriesKcal","exerciseActiveKcal","exerciseRestingKcal","durationMinutes"] as const;
 const texts=["name","sourceSystem","restingSourceSystem","activeSourceSystem","notes"] as const;
 // 新记录的静息预览可随方式、公式及异步资料自动变化，不是用户填写的内容。
 // 选定全天活动档位后才有需要保护的全天估算；已有记录仍比较完整数值与公式。
 const restingPreview=draft.kind==="save_energy_day"&&!draft.id&&draft.restingInputMethod==="estimate"&&!draft.calculation?.activityLevel;
 const input=(restingPreview?{...draft,restingKcal:null,restingSourceSystem:draft.restingSourceSystem?.startsWith("系统估算 · ")?null:draft.restingSourceSystem}:draft) as unknown as Record<string,unknown>;
 const dayHasInput=!!input.id||numbers.some(k=>input[k]!=null&&input[k]!=="")||texts.some(k=>String(input[k]??"").trim());
 const meaningful=dayHasInput||items.some(exerciseHasInput);
 const day=[draft.kind,...numbers.map(k=>numericDraftValue(input[k]==null?null:String(input[k]))),...texts.map(k=>String(input[k]??"").trim()),meaningful?[input.date,dayHasInput?input.entryMode:null,dayHasInput?input.activityMode:null,input.calorieMode,input.timezone]:null];
 const rows=items.filter(exerciseHasInput).map(item=>[item.id??"",item.name.trim(),item.calorieMode??"total",...numbers.map(k=>numericDraftValue((item as unknown as Record<string,string|null>)[k])),item.sourceSystem?.trim()??"",item.timezone??"",item.completed!==false,item.inclusion??null]);
 return JSON.stringify([day,rows,draft.kind==="save_activity"?draft.inclusion??null:null,draft.kind==="save_energy_day"&&dayHasInput&&!restingPreview?[draft.restingInputMethod??null,draft.calculation??null]:null]);
}
