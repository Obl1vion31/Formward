import {readFile,writeFile} from "node:fs/promises";
import {relative,resolve} from "node:path";
import {createDatabase} from "../src/db/client";
import {previewFoodMaintenance,applyFoodMaintenance} from "../src/features/meals/food-maintenance";
import {readMealSnapshot} from "../src/features/meals/records";
const [file,mode="--preview",expected]=process.argv.slice(2),root=resolve("data/exports"),target=resolve(file??".");
if(!file||relative(root,target).startsWith("..")||target===root||!target.endsWith(".json")||!["--preview","--write"].includes(mode)||(mode==="--write"&&!expected))throw new Error("用法：node --env-file=.env.local --import tsx scripts/maintain-foods.mts data/exports/私有请求.json --preview|--write 预览摘要");
if(!process.env.DATABASE_URL)throw new Error("请配置 DATABASE_URL。");
const {userId,request}=JSON.parse(await readFile(target,"utf8")),database=createDatabase(process.env.DATABASE_URL);
try{
 if(mode==="--preview"){const preview=await previewFoodMaintenance(database.db,userId,request);await writeFile(target.replace(/\.json$/,".preview.json"),JSON.stringify(preview,null,2),{mode:0o600});console.log(JSON.stringify({digest:preview.digest,foods:preview.foods.length,affectedMeals:preview.affectedMeals}));}
 else{
  try{await writeFile(target.replace(/\.json$/,".before.json"),JSON.stringify(await readMealSnapshot(database.db,userId),null,2),{mode:0o600,flag:"wx"});}catch(error){if(!(error instanceof Error&&"code" in error&&error.code==="EEXIST"))throw error;}
  const result=await applyFoodMaintenance(database.db,userId,request,expected!);await writeFile(target.replace(/\.json$/,".result.json"),JSON.stringify({result,after:await readMealSnapshot(database.db,userId)},null,2),{mode:0o600});console.log(JSON.stringify(result));
 }
}finally{await database.close();}
