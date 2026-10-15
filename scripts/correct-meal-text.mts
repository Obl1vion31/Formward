import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createDatabase } from "../src/db/client";
import { previewMealTextCorrection, applyMealTextCorrection } from "../src/features/meals/text-maintenance";
import { readMealSnapshot } from "../src/features/meals/records";

const [file,mode="--preview",expectedDigest]=process.argv.slice(2),root=resolve("data/exports"),target=resolve(file??".");
if(!file||relative(root,target).startsWith("..")||target===root||!target.endsWith(".json")||!["--preview","--write"].includes(mode)||(mode==="--write"&&!expectedDigest))throw new Error("用法：node --env-file=.env.local --import tsx scripts/correct-meal-text.mts data/exports/私有请求.json --preview|--write 预览摘要");
if(!process.env.DATABASE_URL)throw new Error("请配置 DATABASE_URL。");
const {userId,request}=JSON.parse(await readFile(target,"utf8")),database=createDatabase(process.env.DATABASE_URL);
try {
  if(mode==="--preview"){
    const preview=await previewMealTextCorrection(database.db,userId,request);
    await writeFile(target.replace(/\.json$/,".preview.json"),JSON.stringify(preview,null,2),{mode:0o600});
    console.log(JSON.stringify({digest:preview.digest,foods:preview.foodChanged?1:0,items:preview.items.length}));
  } else {
    // 独立保存执行前快照；重复执行保留首次备份。
    const before=await readMealSnapshot(database.db,userId);
    try{await writeFile(target.replace(/\.json$/,".before.json"),JSON.stringify(before,null,2),{mode:0o600,flag:"wx"});}catch(error){if(!(error instanceof Error&&"code" in error&&error.code==="EEXIST"))throw error;}
    const result=await applyMealTextCorrection(database.db,userId,request,expectedDigest!);
    await writeFile(target.replace(/\.json$/,".result.json"),JSON.stringify({result,after:await readMealSnapshot(database.db,userId)},null,2),{mode:0o600});
    console.log(JSON.stringify(result));
  }
}finally{await database.close();}
