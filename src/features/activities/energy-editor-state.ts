import {numericDraftValue} from "../../components/form-draft";
import type {EnergyAction} from "./model";
type Exercise={id?:string;name:string;calorieMode?:string;caloriesKcal?:string|null;exerciseActiveKcal?:string|null;exerciseRestingKcal?:string|null;durationMinutes?:string|null;sourceSystem?:string|null;timezone?:string|null;completed?:boolean;inclusion?:string|null};
export const exerciseHasInput=(item:Exercise)=>!!item.id||!!item.name.trim()||!!item.sourceSystem?.trim()||[item.caloriesKcal,item.exerciseActiveKcal,item.exerciseRestingKcal,item.durationMinutes].some(v=>v!=null&&v!=="");
export function energyDraftSignature(draft:EnergyAction,items:Exercise[]){
 const numbers=["restingKcal","activeKcal","totalKcal","steps","caloriesKcal","exerciseActiveKcal","exerciseRestingKcal","durationMinutes"] as const;
 const texts=["name","sourceSystem","restingSourceSystem","activeSourceSystem","notes"] as const;
 const input=draft as unknown as Record<string,unknown>;
 const meaningful=!!input.id||numbers.some(k=>input[k]!=null&&input[k]!=="")||texts.some(k=>String(input[k]??"").trim())||items.some(exerciseHasInput);
 const day=[draft.kind,...numbers.map(k=>numericDraftValue(input[k]==null?null:String(input[k]))),...texts.map(k=>String(input[k]??"").trim()),meaningful?[input.date,input.entryMode,input.activityMode,input.calorieMode,input.timezone]:null];
 const rows=items.filter(exerciseHasInput).map(item=>[item.id??"",item.name.trim(),item.calorieMode??"total",...numbers.map(k=>numericDraftValue((item as unknown as Record<string,string|null>)[k])),item.sourceSystem?.trim()??"",item.timezone??"",item.completed!==false,item.inclusion??null]);
 return JSON.stringify([day,rows,draft.kind==="save_activity"?draft.inclusion??null:null]);
}
