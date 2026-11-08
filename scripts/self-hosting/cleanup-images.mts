import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { and,eq } from "drizzle-orm";
import { createDatabase } from "../../src/db/client";
import { mealImage,user } from "../../src/db/schema";
import { imageStorage } from "../../src/features/meals/image-storage";
const [file,provider,location,apply]=process.argv.slice(2);
if(!file||!["blob","cos"].includes(provider)||!location||![undefined,"--apply"].includes(apply))throw new Error("用法：cleanup-images.mts 私有环境文件 blob|cos 固定位置 [--apply]");
const env=parseEnv(await readFile(file,"utf8"));if(!env.DATABASE_URL)throw new Error("环境文件缺少显式目标。");
const database=createDatabase(env.DATABASE_URL);
for(const key of Object.keys(process.env))if(/^(DATABASE|FORMWARD_COS|BLOB_)/.test(key))delete process.env[key];
Object.assign(process.env,env);
const storage=imageStorage({storageProvider:provider as "blob"|"cos",storageLocation:location}),cutoff=Date.now()-86400000;let eligible=0,removed=0;
try{
 for(const prefix of ["meal-tmp-v2/","meal-formal-v2/"])for(const object of await storage.list(prefix)){
  if(object.createdAt.getTime()>=cutoff||!Number.isFinite(object.createdAt.getTime()))continue;
  const parts=object.pathname.split("/");if(parts.length!==3||!parts[1]||!parts[2])continue;
  await database.db.transaction(async tx=>{
   const [owner]=await tx.select({id:user.id}).from(user).where(eq(user.id,parts[1])).for("update");if(!owner)return;
   const [registered]=await tx.select({id:mealImage.id}).from(mealImage).where(and(eq(mealImage.storageProvider,provider as "blob"|"cos"),eq(mealImage.storageLocation,location),eq(mealImage.pathname,object.pathname)));
   if(registered)return;eligible++;if(apply){await storage.remove(object.pathname);removed++;}
  });
 }
 console.log(JSON.stringify({dryRun:!apply,eligible,removed}));
}finally{await database.close();}
