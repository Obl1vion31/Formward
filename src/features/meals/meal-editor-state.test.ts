import assert from "node:assert/strict";
import {test} from "node:test";
import {editorDecimal,editorItem,editorItemInput,freeEditorItem,mealEditorInput} from "./meal-editor-state";
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
