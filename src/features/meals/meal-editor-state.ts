import {emptyNutrition,type ItemDraft,type MealDraft,type Nutrition} from "./model";

export type EditorItem = ItemDraft & {editor:{key:number;original:ItemDraft;initial:ItemDraft}};
export type EditorMeal = Omit<MealDraft,"items"> & {items:EditorItem[]};

/** 只移除不影响数值的末尾零，不对有效小数位取整。 */
export function editorDecimal(value:string){return value.replace(/(\.\d*?[1-9])0+$|\.0+$/,"$1");}

/** 展示总量，但未改动的旧项仍提交原口径，编辑器元数据永不进入请求。 */
export function editorItem(input:ItemDraft,key:number,total?:Nutrition,library=false):EditorItem{
 const original=structuredClone(input);
 let value:ItemDraft={...structuredClone(input),kind:"food"};
 if(!library&&input.nutritionBasis==="per_portion"){
  const {perPortionNutrition,...rest}=value;void perPortionNutrition;
  value={...rest,nutritionBasis:"consumed_total",nutrition:structuredClone(total??emptyNutrition())};
 }
 if(value.quantity)value.quantity=editorDecimal(value.quantity);
 if(value.nutrition)value.nutrition=Object.fromEntries(Object.entries(value.nutrition).map(([metric,v])=>[metric,v==null?null:editorDecimal(v)])) as Nutrition;
 return {...value,editor:{key,original,initial:structuredClone(value)}};
}
export function freeEditorItem(key:number):EditorItem{
 return editorItem({kind:"food",name:"",quantity:"1",unit:"份",sourceKind:"estimated",nutritionBasis:"consumed_total",nutrition:emptyNutrition()},key);
}
export function editorItemInput(item:EditorItem):ItemDraft{
 const {editor,...value}=item;
 return JSON.stringify(value)===JSON.stringify(editor.initial)?structuredClone(editor.original):value;
}
export function mealEditorInput(meal:EditorMeal):MealDraft{
 return {...meal,items:meal.items.filter(item=>item.name.trim()).map(editorItemInput)};
}
