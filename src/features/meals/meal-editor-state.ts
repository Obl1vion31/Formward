import {decimal,emptyNutrition,scaled,type ItemDraft,type MealDraft,type Nutrition,type Metric} from "./model";

export type EditorItem = ItemDraft & {editor:{key:number;original:ItemDraft;initial:ItemDraft;library:boolean;caloriesAutomatic?:boolean;calorieIssue?:string}};
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
 return {...value,editor:{key,original,initial:structuredClone(value),library}};
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

/** 只处理网页真实营养编辑；原项、库值和未触碰的旧精度不做公式回填。 */
export function updateEditorNutrition(item:EditorItem,metric:Metric,value:string):EditorItem{
 if(item.editor.library)return item;
 const nutrition={...(item.nutrition??emptyNutrition())},nextValue=value||null;
 if(nutrition[metric]===nextValue)return item;
 nutrition[metric]=nextValue;
 const editor={...item.editor};
 if(metric==="caloriesKcal"){editor.caloriesAutomatic=false;editor.calorieIssue=undefined;}
 else {
  const macros=[nutrition.proteinG,nutrition.carbsG,nutrition.fatG];
  if(macros.every(v=>v!==null&&decimal.safeParse(v).success)){
   // scaled 保留四位；用整数相加避免二进制浮点或逐项提前取整。
   const units=macros.map((v,i)=>BigInt(scaled(v!,i===2?"9":"4","1").replace(".","")));
   const total=units.reduce((a,b)=>a+b,BigInt(0));
   editor.caloriesAutomatic=true;
   if(total>BigInt(1000000)*BigInt(10000)){
    nutrition.caloriesKcal=null;editor.calorieIssue="按营养计算的热量超过1000000千卡，请检查三项营养。";
   }else{
    nutrition.caloriesKcal=editorDecimal(String(total/BigInt(10000))+"."+String(total%BigInt(10000)).padStart(4,"0"));
    editor.calorieIssue=undefined;
   }
  }else{
   if(editor.caloriesAutomatic)nutrition.caloriesKcal=null;
   editor.calorieIssue=undefined;
  }
 }
 return {...item,nutrition,editor};
}
