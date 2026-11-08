import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/postgres-js/migrator";
import {eq,sql} from "drizzle-orm";
import {createDatabase} from "../src/db/client";
import {user,personalProfile} from "../src/db/schema";
import {provisionAccount} from "../src/features/auth/provision";
import {seedDetailHierarchy} from "../tests/detail-hierarchy-fixture.mjs";
import {addCalendarDays} from "../src/features/measurements/calendar";
import {localMeasurementDate} from "../src/features/measurements/entry-state";

// 仅用于独立公网 IP 演示库；拒绝其他数据库、远程数据库和真实邮箱。
const url=process.env.DATABASE_URL;
if(!url)throw new Error("缺少测试库连接配置。");
const target=new URL(url);
if(!["127.0.0.1","localhost"].includes(target.hostname)||target.pathname!=="/formward_ip_preview")throw new Error("仅允许本机 formward_ip_preview 测试库。");
const access=JSON.parse(await readFile(process.env.FORMWARD_PREVIEW_ACCESS_FILE??"/etc/formward/ip-preview/access.json","utf8")) as {email:string;password:string};
if(!access.email.endsWith("@example.test")||access.password.length<16)throw new Error("必须使用独立虚构账号及随机测试密码。");
const database=createDatabase(url);
try{
 await migrate(database.db,{migrationsFolder:process.env.FORMWARD_MIGRATIONS_DIR??"./drizzle"});
 const existing=await database.db.select({id:user.id}).from(user).where(eq(user.email,access.email));
 if(!existing.length){
  if((await database.db.select({id:user.id}).from(user)).length)throw new Error("测试库包含未知账号，拒绝初始化。");
  const account=await provisionAccount(database.db,{...access,name:"公网演示 · 虚构账号"});
  await database.db.delete(personalProfile).where(eq(personalProfile.userId,account.id));
  const today=localMeasurementDate(new Date(),"Asia/Shanghai");
  await database.db.update(user).set({createdAt:new Date(addCalendarDays(today,-40)+"T00:00:00Z")}).where(eq(user.id,account.id));
  await seedDetailHierarchy(database.db,account.id,today,{stressOffset:-37});
  console.log(JSON.stringify({initialized:true,email:access.email,fixture:"fictional",requestId:randomUUID()}));
 }else console.log(JSON.stringify({initialized:false,email:access.email,reason:"保留已有测试账号与记录"}));
 await database.db.execute(sql.raw("GRANT USAGE ON SCHEMA public TO formward_ip_preview_app"));
 await database.db.execute(sql.raw("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO formward_ip_preview_app"));
 await database.db.execute(sql.raw("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO formward_ip_preview_app"));
}finally{await database.close();}
