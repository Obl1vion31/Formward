import assert from "node:assert/strict";
import {test} from "node:test";
import {editorDecimal,editorItem,editorItemInput,freeEditorItem,mealEditorInput,mealDraftSignature,emptyEditorItem,updateEditorNutrition,type EditorItem} from "./meal-editor-state";
import {emptyNutrition,type ItemDraft} from "./model";
const nutrition={...emptyNutrition(),caloriesKcal:"135.1234",proteinG:"0",carbsG:null,fatG:"0.0001"};
const old:ItemDraft={kind:"food",name:"虚构鸡蛋",quantity:"1.5",unit:"个",nutritionBasis:"per_portion",perPortionNutrition:{...nutrition,caloriesKcal:"90"},sourceKind:"estimated"};
test("新自由项按本次总量保存，150g或改为200g都不再乘营养",()=>{
 const row={...freeEditorItem(0),name:"虚构鸡胸",quantity:"150",unit:"g",nutrition:{...nutrition,caloriesKcal:"240"}};
 const a=editorItemInput(row),b=editorItemInput({...row,quantity:"200"});
 assert.equal(a.nutritionBasis,"consumed_total");assert.equal(a.nutrition?.caloriesKcal,"240");assert.deepEqual(b.nutrition,a.nutrition);assert.equal(b.quantity,"200");
});
test("旧按份项用服务端总量回显，未修改时原样提交并保留四位精度、零和未知",()=>{
 const row=editorItem(old,0,nutrition);
 assert.deepEqual(row.nutrition,nutrition);assert.equal(row.perPortionNutrition,undefined);assert.equal(row.nutritionBasis,"consumed_total");
 assert.deepEqual(editorItemInput(row),old);assert.deepEqual(old.perPortionNutrition?.caloriesKcal,"90");
});
test("修改旧项数量、名称或来源后按总量提交，不再次相乘",()=>{
 const row=editorItem(old,0,nutrition);
 for(const change of [{quantity:"2"},{name:"虚构新名称"},{sourceKind:"reference" as const}]){
  const saved=editorItemInput({...row,...change});
  assert.equal(saved.nutritionBasis,"consumed_total");assert.deepEqual(saved.nutrition,nutrition);assert.equal(saved.perPortionNutrition,undefined);
 }
});
test("修改营养只替换指定总量，移除行后仍按各自原项保存",()=>{
 const one=editorItem(old,0,nutrition),two=editorItem({...old,name:"虚构另一项"},1,{...nutrition,caloriesKcal:"246.5678"});
 const saved=mealEditorInput({date:"2024-08-01",mealType:"午餐",items:[{...two,nutrition:{...two.nutrition!,caloriesKcal:"240"}},freeEditorItem(2)]});
 assert.equal(saved.items.length,1);assert.equal(saved.items[0].name,"虚构另一项");assert.equal(saved.items[0].nutrition?.caloriesKcal,"240");assert.equal(JSON.stringify(saved).includes('"editor"'),false);void one;
});
test("库引用、审核foodRef和历史快照不得转换成手填营养",()=>{
 for(const input of [{...old,foodId:"id"},{...old,foodRef:"food-key"},{...old,foodDraft:{name:"x"} as ItemDraft["foodDraft"]}]){
  const row=editorItem(input,0,nutrition,true);assert.deepEqual(editorItemInput(row),input);
 }
 const archived=editorItem({kind:"food",name:"虚构归档库项",quantity:"0.5",unit:"包",sourceKind:"estimated"},0,nutrition,true);
 assert.equal(archived.nutrition,undefined);assert.equal(archived.nutritionBasis,undefined);
});
test("无服务端有效总量的旧预览保留未知，不把每份值当作本次总量",()=>{
 const row=editorItem(old,0);assert.deepEqual(row.nutrition,emptyNutrition());assert.deepEqual(editorItemInput(row),old);
});

test("仅清除末尾零，包装换算和旧项的有效四位小数保持",()=>{
 for(const [raw,shown]of[["45.0000","45"],["1.2000","1.2"],["0.0001","0.0001"],["135.1234","135.1234"],["0.0000","0"]])assert.equal(editorDecimal(raw),shown);
 const input={...old,quantity:"1.5000"};const row=editorItem(input,0,{...nutrition,caloriesKcal:"135.0000",proteinG:"0.0000"});
 assert.equal(row.quantity,"1.5");assert.equal(row.nutrition?.caloriesKcal,"135");assert.deepEqual(editorItemInput(row),input);
});

test("自由项三项填全以4/4/9算本次总量，零可计算且数量不重复乘",()=>{
 let row:EditorItem={...freeEditorItem(0),name:"虚构三明治",quantity:"2"};
 for(const [metric,value]of[["proteinG","17"],["carbsG","4"],["fatG","1"]] as const)row=updateEditorNutrition(row,metric,value);
 assert.equal(row.nutrition?.caloriesKcal,"93");
 assert.equal(editorItemInput(row).nutrition?.caloriesKcal,"93");
 row=updateEditorNutrition(row,"fatG","0");assert.equal(row.nutrition?.caloriesKcal,"84");
 row=updateEditorNutrition(row,"proteinG","0");row=updateEditorNutrition(row,"carbsG","0");assert.equal(row.nutrition?.caloriesKcal,"0");
});
test("手填热量立即生效，下一次实际宏量编辑重算；同值和只改备注不重算",()=>{
 let row=editorItem({kind:"food",name:"虚构包装",nutritionBasis:"consumed_total",sourceKind:"reference",nutrition:{caloriesKcal:"100.1234",proteinG:"17",carbsG:"4",fatG:"1"}},0);
 const before=structuredClone(row);
 assert.equal(updateEditorNutrition(row,"proteinG","17"),row);
 assert.equal(mealEditorInput({date:"2026-11-01",mealType:"午餐",notes:"只改备注",items:[row]}).items[0].nutrition?.caloriesKcal,"100.1234");
 row=updateEditorNutrition(row,"caloriesKcal","120");assert.equal(row.nutrition?.caloriesKcal,"120");
 row=updateEditorNutrition(row,"carbsG","5");assert.equal(row.nutrition?.caloriesKcal,"97");
 row=updateEditorNutrition(row,"fatG","");assert.equal(row.nutrition?.caloriesKcal,null);
 row=updateEditorNutrition(row,"caloriesKcal","90");row=updateEditorNutrition(row,"proteinG","18");assert.equal(row.nutrition?.caloriesKcal,"90");
 assert.deepEqual(before.nutrition,{caloriesKcal:"100.1234",proteinG:"17",carbsG:"4",fatG:"1"});
});
test("库营养不套用宏量公式；未触碰旧数和编辑元数据不进入请求",()=>{
 const original={kind:"food" as const,name:"虚构库项",sourceKind:"reference" as const,nutrition:{caloriesKcal:"93.1234",proteinG:"17",carbsG:"4",fatG:"2"}};
 const row=editorItem(original,0,undefined,true);
 assert.equal(updateEditorNutrition(row,"fatG","1"),row);assert.deepEqual(editorItemInput(row),original);
 assert.equal(JSON.stringify(editorItemInput(row)).includes("caloriesAutomatic"),false);
});
test("旧宏量保留四位精度计算，不逐项提前取整；未知和超限不能冒充总热量",()=>{
 let row=editorItem({kind:"food",name:"虚构旧值",sourceKind:"estimated",nutrition:{caloriesKcal:"1",proteinG:"0.0001",carbsG:"0.0001",fatG:null}},0);
 row=updateEditorNutrition(row,"fatG","1");assert.equal(row.nutrition?.caloriesKcal,"9.0008");
 row=updateEditorNutrition(row,"fatG","");assert.equal(row.nutrition?.caloriesKcal,null);
 row=updateEditorNutrition(row,"fatG","1000000");assert.match(row.editor.calorieIssue!,/超过/);assert.equal(row.nutrition?.caloriesKcal,null);
 row=updateEditorNutrition(row,"fatG","2");assert.equal(row.editor.calorieIssue,undefined);assert.equal(row.nutrition?.caloriesKcal,"18.0008");
});

test("小数宏量按原精度计算热量，取整仅用于展示",()=>{
 let row:EditorItem={...freeEditorItem(0),name:"虚构小数营养"};
 for(const [metric,value]of[["proteinG","1.2345"],["carbsG","0"],["fatG","0.1"]] as const)row=updateEditorNutrition(row,metric,value);
 assert.deepEqual(row.nutrition,{caloriesKcal:"5.838",proteinG:"1.2345",carbsG:"0",fatG:"0.1"});
 assert.equal(editorItemInput(row).nutrition?.caloriesKcal,"5.838");
 assert.equal(updateEditorNutrition(row,"fatG","0.1"),row);
});


test("未命名营养及明确0不能被过滤，默认空白占位不制造草稿",()=>{
 const item=freeEditorItem(0),meal={date:"2026-11-03",mealType:"午餐",items:[item]};
 const baseline=mealDraftSignature(meal);assert.equal(emptyEditorItem(item),true);assert.equal(mealEditorInput(meal).items.length,0);
 for(const value of ["20","0"]){const next=updateEditorNutrition(item,"proteinG",value);assert.equal(emptyEditorItem(next),false);assert.equal(mealEditorInput({...meal,items:[next]}).items[0].nutrition?.proteinG,value);assert.notEqual(mealDraftSignature({...meal,items:[next]}),baseline);}
 const typed=updateEditorNutrition(item,"proteinG","20"),cleared=updateEditorNutrition(typed,"proteinG","");
 assert.equal(mealDraftSignature({...meal,items:[cleared]}),baseline);
});
test("数值去尾零与派生说明不算草稿，真实历史精度变化仍计为修改",()=>{
 const item=editorItem({kind:"food",name:"虚构食物",quantity:"1",unit:"份",sourceKind:"reference",nutritionBasis:"consumed_total",nutrition:{...emptyNutrition(),proteinG:"17.51"}},0);
 const meal={date:"2026-11-03",mealType:"午餐",items:[item]};
 assert.equal(mealDraftSignature({...meal,items:[{...item,quantity:"1.00"}]}),mealDraftSignature(meal));
 assert.notEqual(mealDraftSignature({...meal,items:[{...item,nutrition:{...item.nutrition!,proteinG:"17.5"}}]}),mealDraftSignature(meal));
 assert.deepEqual(editorItemInput({...item,quantity:"1.00"}),item.editor.original);
});

test("公式已自动计算后，全部删除回初始空白不提示草稿",()=>{let item=freeEditorItem(0);const meal={date:"2026-11-03",mealType:"午餐",items:[item]},signature=mealDraftSignature(meal);for(const metric of ["proteinG","carbsG","fatG"] as const)item=updateEditorNutrition(item,metric,"1");for(const metric of ["proteinG","carbsG","fatG"] as const)item=updateEditorNutrition(item,metric,"");assert.equal(mealDraftSignature({...meal,items:[item]}),signature);});
